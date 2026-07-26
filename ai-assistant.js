(function (globalScope) {
    'use strict';

    const api = globalScope.aiAPI;
    const markdown = globalScope.safeMarkdown;
    const MAX_MESSAGE_LENGTH = 30000;
    const DEFAULT_AGENT_TONE = 'neutral';
    const AGENT_AVATAR_PATHS = Object.freeze({
        special_ed_teacher: './images/ai-agent-avatars/个别化教学专家.png',
        scgp_builtin_communication_support: './images/ai-agent-avatars/课堂沟通支持专家.png',
        scgp_builtin_growth_observer: './images/ai-agent-avatars/成长观察助手.png',
        scgp_builtin_family_communication: './images/ai-agent-avatars/家校沟通助手.png',
        scgp_builtin_wellbeing_support: './images/ai-agent-avatars/情绪支持助手.png',
    });

    const state = {
        agents: [],
        providers: [],
        conversations: [],
        preference: null,
        usage: null,
        knowledge: null,
        currentConversationId: null,
        messages: [],
        providerCode: null,
        draftEndpoints: [],
        draftActiveEndpoint: '',
        activeRequest: null,
        startingConversationId: null,
        cancelStartingRequested: false,
        pendingEvents: new Map(),
        pendingDraft: '',
        noticeTimer: null,
        bootstrapped: false,
        allAgents: [],
        currentAttachments: [],
        editingMessageId: null,
    };

    const elements = {};

    function getElement(id) {
        return document.getElementById(id);
    }

    function cacheElements() {
        [
            'conversationList',
            'conversationEmpty',
            'conversationCount',
            'newConversationButton',
            'currentAgentAvatar',
            'currentAgentName',
            'currentAgentTagline',
            'switchAgentButton',
            'agentSwitcher',
            'agentSwitcherList',
            'headerProviderStatus',
            'headerProviderText',
            'noticeBar',
            'noticeIcon',
            'noticeText',
            'noticeCloseButton',
            'messageScroll',
            'emptyWorkspace',
            'agentGrid',
            'messageList',
            'messageInput',
            'attachImageButton',
            'imageFileInput',
            'attachmentPreviewStrip',
            'providerSupportsVision',
            'characterCount',
            'stopButton',
            'sendButton',
            'providerSegments',
            'providerForm',
            'providerBaseUrl',
            'providerBaseUrlError',
            'providerModelLabel',
            'providerModelError',
            'endpointList',
            'endpointInput',
            'addEndpointButton',
            'providerApiKey',
            'saveProviderButton',
            'testProviderButton',
            'clearProviderButton',
            'providerKeyStatus',
            'usageMonth',
            'usageTotal',
            'usageLimitText',
            'usageProgress',
            'budgetForm',
            'monthlyTokenLimit',
            'monthlyTokenLimitError',
            'hardLimitEnabled',
            'privacyStatusText',
            'knowledgeCatalogList',
            'knowledgeCatalogSummary',
            'agentGovernanceList',
            'createAgentButton',
            'privacyDialog',
            'privacyProviderName',
            'declinePrivacyButton',
            'acceptPrivacyButton',
            'initializingLayer',
            'initializingText',
            'retryBootstrapButton',
            'openConversationPanelButton',
            'closeConversationPanelButton',
            'openSettingsPanelButton',
            'closeSettingsPanelButton',
            'settingsPanel',
            'panelBackdrop',
            'editBanner',
            'editBannerCancel',
        ].forEach((id) => {
            elements[id] = getElement(id);
        });
        elements.knowledgeSection = document.querySelector('.knowledge-section');
        elements.agentGovernanceSection = document.querySelector('.agent-governance-section');
        elements.budgetSection = document.querySelector('.budget-section');
    }

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (text !== undefined) {
            element.textContent = text;
        }
        return element;
    }

    function createIcon(className) {
        const icon = createElement('i', className);
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    }

    function populateAgentAvatar(avatar, agent, fallbackText = 'AI') {
        avatar.textContent = agent?.avatarText || fallbackText;
        avatar.classList.remove('has-image');
        const imagePath = agent ? AGENT_AVATAR_PATHS[agent.code] : '';
        if (!imagePath) {
            return;
        }

        const image = createElement('img', 'agent-avatar-image');
        image.src = imagePath;
        image.alt = '';
        image.draggable = false;
        image.addEventListener('error', () => {
            image.remove();
            avatar.classList.remove('has-image');
        }, { once: true });
        avatar.classList.add('has-image');
        avatar.appendChild(image);
    }

    function createAgentAvatar(agent, className, fallbackText = 'AI') {
        const avatar = createElement('span', `${className} tone-${agent?.avatarTone || DEFAULT_AGENT_TONE}`);
        avatar.setAttribute('aria-hidden', 'true');
        populateAgentAvatar(avatar, agent, fallbackText);
        return avatar;
    }

    function updateAgentAvatar(avatar, agent, className, fallbackText = 'AI') {
        avatar.className = `${className} tone-${agent?.avatarTone || DEFAULT_AGENT_TONE}`;
        populateAgentAvatar(avatar, agent, fallbackText);
    }

    function normalizeError(error, fallbackMessage = '请求未完成，请稍后重试。') {
        if (error && typeof error === 'object') {
            return {
                kind: error.kind || 'internal',
                message: error.message || fallbackMessage,
            };
        }
        return { kind: 'internal', message: fallbackMessage };
    }

    function unwrap(result, fallbackMessage) {
        if (!result || result.success !== true) {
            throw normalizeError(result?.error, fallbackMessage);
        }
        return result.data;
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    }

    function formatTime(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    function getAgent(code) {
        return state.agents.find((agent) => agent.code === code) || null;
    }

    function getProvider(code) {
        return state.providers.find((provider) => provider.code === code) || null;
    }

    function currentConversation() {
        return state.conversations.find((conversation) => conversation.id === state.currentConversationId) || null;
    }

    function currentAgent() {
        return getAgent(currentConversation()?.agentCode);
    }

    function isBusy() {
        return Boolean(state.activeRequest || state.startingConversationId);
    }

    function showStatus(message, kind = 'warning', duration = 6000) {
        if (!elements.noticeBar) {
            return;
        }
        window.clearTimeout(state.noticeTimer);
        elements.noticeBar.hidden = false;
        elements.noticeBar.className = `notice-bar is-${kind}`;
        elements.noticeIcon.className = kind === 'error'
            ? 'fa-solid fa-circle-exclamation'
            : kind === 'success'
                ? 'fa-solid fa-circle-check'
                : 'fa-solid fa-circle-info';
        elements.noticeIcon.setAttribute('aria-hidden', 'true');
        elements.noticeText.textContent = message;
        if (duration > 0) {
            state.noticeTimer = window.setTimeout(() => {
                elements.noticeBar.hidden = true;
            }, duration);
        }
    }

    function hideStatus() {
        window.clearTimeout(state.noticeTimer);
        elements.noticeBar.hidden = true;
    }

    function showInitializing(message, isError = false) {
        elements.initializingLayer.hidden = false;
        elements.initializingLayer.classList.toggle('is-error', isError);
        elements.initializingText.textContent = message;
        elements.retryBootstrapButton.hidden = !isError;
    }

    function closePanels() {
        document.body.classList.remove('show-conversations', 'show-settings');
        elements.panelBackdrop.hidden = true;
        elements.settingsPanel.setAttribute('aria-hidden', 'true');
        elements.settingsPanel.setAttribute('inert', '');
        closeAgentSwitcher();
    }

    function openPanel(panelName) {
        closeAgentSwitcher();
        document.body.classList.remove('show-conversations', 'show-settings');
        document.body.classList.add(panelName === 'settings' ? 'show-settings' : 'show-conversations');
        if (panelName === 'settings') {
            elements.settingsPanel.setAttribute('aria-hidden', 'false');
            elements.settingsPanel.removeAttribute('inert');
            loadAgentGovernance();
        } else {
            elements.settingsPanel.setAttribute('aria-hidden', 'true');
            elements.settingsPanel.setAttribute('inert', '');
        }
        elements.panelBackdrop.hidden = false;
    }

    function closeAgentSwitcher() {
        if (!elements.agentSwitcher || !elements.switchAgentButton) {
            return;
        }
        elements.agentSwitcher.hidden = true;
        elements.switchAgentButton.setAttribute('aria-expanded', 'false');
    }

    function toggleAgentSwitcher() {
        if (!elements.agentSwitcher.hidden) {
            closeAgentSwitcher();
            return;
        }
        closePanels();
        renderAgentSwitcher();
        elements.agentSwitcher.hidden = false;
        elements.switchAgentButton.setAttribute('aria-expanded', 'true');
    }

    function setButtonBusy(button, busy, busyText) {
        if (!button) {
            return;
        }
        if (busy) {
            const label = button.querySelector('span');
            button.dataset.idleText = label ? label.textContent : button.textContent;
            if (label) {
                label.textContent = busyText;
            } else {
                button.textContent = busyText;
            }
            button.disabled = true;
        } else {
            const label = button.querySelector('span');
            if (label && button.dataset.idleText !== undefined) {
                label.textContent = button.dataset.idleText;
            } else if (button.dataset.idleText !== undefined) {
                button.textContent = button.dataset.idleText;
            }
            button.disabled = false;
        }
    }

    function renderCurrentAgent() {
        const agent = currentAgent();
        const conversation = currentConversation();
        const provider = getProvider(state.preference?.currentProviderCode);
        const displayAgent = agent || null;

        updateAgentAvatar(elements.currentAgentAvatar, displayAgent, 'current-agent-avatar');
        elements.currentAgentName.textContent = displayAgent?.displayName || displayAgent?.name || '选择一位助手';
        elements.currentAgentTagline.textContent = displayAgent?.tagline || (conversation ? '准备开始新的教师工作对话' : '开始新的教师工作对话');
        elements.switchAgentButton.disabled = state.agents.length === 0;

        const configured = Boolean(provider?.hasApiKey);
        elements.headerProviderStatus.classList.toggle('is-ready', configured);
        elements.headerProviderText.textContent = provider
            ? `${provider.name} ${configured ? '已配置' : '未配置'}`
            : '服务未配置';
    }

    function renderConversations() {
        elements.conversationList.replaceChildren();
        elements.conversationCount.textContent = String(state.conversations.length);
        elements.conversationEmpty.hidden = state.conversations.length > 0;

        state.conversations.forEach((conversation) => {
            const item = createElement('div', 'conversation-item');
            item.setAttribute('role', 'listitem');
            if (conversation.id === state.currentConversationId) {
                item.classList.add('is-active');
            }

            const mainButton = createElement('button', 'conversation-main');
            mainButton.type = 'button';
            mainButton.title = conversation.title;
            mainButton.addEventListener('click', () => selectConversation(conversation.id));

            const agentAvatar = createAgentAvatar(getAgent(conversation.agentCode), 'conversation-agent-avatar');
            const copy = createElement('span', 'conversation-copy');
            copy.appendChild(createElement('span', 'conversation-title', conversation.title));
            copy.appendChild(createElement('span', 'conversation-meta', `${conversation.agentName || 'AI 助手'} · ${formatDate(conversation.updatedAt)}`));
            mainButton.append(agentAvatar, copy);

            const actions = createElement('span', 'conversation-actions');
            const renameButton = createElement('button', 'conversation-action');
            renameButton.type = 'button';
            renameButton.setAttribute('aria-label', `重命名 ${conversation.title}`);
            renameButton.title = '重命名';
            renameButton.appendChild(createIcon('fa-solid fa-pen'));
            renameButton.addEventListener('click', (event) => {
                event.stopPropagation();
                renameConversation(conversation);
            });

            const deleteButton = createElement('button', 'conversation-action');
            deleteButton.type = 'button';
            deleteButton.setAttribute('aria-label', `删除 ${conversation.title}`);
            deleteButton.title = '删除';
            deleteButton.appendChild(createIcon('fa-solid fa-trash-can'));
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteConversation(conversation);
            });
            actions.append(renameButton, deleteButton);
            item.append(mainButton, actions);
            elements.conversationList.appendChild(item);
        });
    }

    function renderAgentSwitcher() {
        elements.agentSwitcherList.replaceChildren();
        const activeAgentCode = currentConversation()?.agentCode || null;

        state.agents.forEach((agent) => {
            const isCurrent = agent.code === activeAgentCode;
            const option = createElement('button', 'agent-switch-option');
            option.type = 'button';
            option.setAttribute('role', 'menuitemradio');
            option.setAttribute('aria-checked', String(isCurrent));
            option.setAttribute('aria-current', String(isCurrent));

            const avatar = createAgentAvatar(agent, 'agent-switch-option-avatar');
            const copy = createElement('span', 'agent-switch-option-copy');
            copy.appendChild(createElement('strong', '', agent.displayName || agent.name));
            copy.appendChild(createElement('span', '', agent.tagline || agent.teacherSupport));
            const status = createElement('span', 'agent-switch-current', isCurrent ? '当前' : '新会话');
            option.append(avatar, copy, status);
            option.addEventListener('click', async () => {
                if (isCurrent) {
                    closeAgentSwitcher();
                    elements.messageInput.focus();
                    return;
                }
                await chooseAgent(agent.code);
            });
            elements.agentSwitcherList.appendChild(option);
        });
    }

    function buildHeroCard(agent) {
        const card = createElement('article', 'agent-card agent-card--hero');
        const avatar = createAgentAvatar(agent, 'agent-avatar agent-avatar--hero', agent.name.slice(0, 1));

        const titles = createElement('div', 'agent-hero-titles');
        titles.appendChild(createElement('h3', '', agent.displayName || agent.name));
        titles.appendChild(createElement('p', '', agent.tagline || agent.teacherSupport || ''));

        const cta = createElement('button', 'agent-select-button agent-hero-cta', '开始对话');
        cta.type = 'button';
        cta.addEventListener('click', () => chooseAgent(agent.code));

        const head = createElement('div', 'agent-hero-head');
        head.append(avatar, titles, cta);
        card.appendChild(head);

        const prompts = Array.isArray(agent.starterPrompts) ? agent.starterPrompts.slice(0, 3) : [];
        if (prompts.length > 0) {
            const promptRow = createElement('div', 'agent-hero-prompts');
            prompts.forEach((prompt) => {
                const chip = createElement('button', 'starter-button', prompt);
                chip.type = 'button';
                chip.title = prompt;
                chip.addEventListener('click', () => chooseAgent(agent.code, prompt));
                promptRow.appendChild(chip);
            });
            card.appendChild(promptRow);
        }
        return card;
    }

    function buildCompactTile(agent) {
        const tile = createElement('button', 'agent-card agent-card--compact');
        tile.type = 'button';
        tile.title = agent.displayName || agent.name;
        tile.addEventListener('click', () => chooseAgent(agent.code));

        const avatar = createAgentAvatar(agent, 'agent-avatar agent-avatar--compact', agent.name.slice(0, 1));
        const body = createElement('div', 'agent-card-body');
        body.appendChild(createElement('h3', '', agent.displayName || agent.name));
        body.appendChild(createElement('p', '', agent.tagline || agent.teacherSupport || ''));
        const hint = createElement('span', 'agent-tile-hint', '开始对话');

        tile.append(avatar, body, hint);
        return tile;
    }

    function buildSimpleAgentCard(agent, inConversation) {
        const card = createElement('article', 'agent-card');
        const avatar = createAgentAvatar(agent, 'agent-avatar', agent.name.slice(0, 1));
        const body = createElement('div', 'agent-card-body');
        body.appendChild(createElement('h3', '', agent.displayName || agent.name));
        body.appendChild(createElement('p', '', agent.tagline || agent.teacherSupport || ''));
        const actions = createElement('div', 'agent-card-actions');
        const chooseButton = createElement('button', 'agent-select-button', inConversation ? '继续对话' : '开始对话');
        chooseButton.type = 'button';
        chooseButton.addEventListener('click', () => chooseAgent(agent.code));
        actions.appendChild(chooseButton);
        body.appendChild(actions);
        card.append(avatar, body);
        return card;
    }

    function renderAgentGrid() {
        elements.agentGrid.replaceChildren();
        const inConversation = Boolean(currentConversation());
        const agents = inConversation ? [currentAgent()].filter(Boolean) : state.agents;
        const showFeatured = !inConversation && agents.length > 1;

        agents.forEach((agent, index) => {
            if (showFeatured && index === 0) {
                elements.agentGrid.appendChild(buildHeroCard(agent));
                return;
            }
            if (showFeatured) {
                elements.agentGrid.appendChild(buildCompactTile(agent));
                return;
            }
            elements.agentGrid.appendChild(buildSimpleAgentCard(agent, inConversation));
        });
    }

    function renderSafeMessageContent(container, message) {
        if (message.role === 'user') {
            container.textContent = message.content || '';
            container.style.whiteSpace = 'pre-wrap';
            return;
        }
        container.style.whiteSpace = '';
        if (markdown?.renderSafeMarkdown) {
            markdown.renderSafeMarkdown(container, message.content || '', {
                onExternalLink: (url) => {
                    api.openExternal(url).then((result) => {
                        unwrap(result, '无法打开外部链接。');
                    }).catch((error) => {
                        showStatus(normalizeError(error, '无法打开外部链接。').message, 'error');
                    });
                },
            });
        } else {
            container.textContent = message.content || '';
        }
    }

    function getMessageStateText(message) {
        if (message.status === 'pending') {
            return '正在生成';
        }
        if (message.status === 'cancelled') {
            return '已停止，可以重新发送';
        }
        if (message.status === 'error') {
            return '回复失败';
        }
        return '';
    }

    function renderMessage(message, editable = false) {
        const row = createElement('article', `message-row is-${message.role}`);
        row.dataset.messageId = message.id;
        if (state.editingMessageId && state.editingMessageId === message.id) {
            row.classList.add('is-editing');
        }

        if (message.role === 'assistant') {
            const agent = currentAgent();
            const avatar = createAgentAvatar(agent, 'message-avatar');
            row.appendChild(avatar);
        }

        const column = createElement('div', 'message-column');
        const meta = createElement('div', 'message-meta');
        meta.appendChild(createElement('strong', '', message.role === 'user' ? '你' : (currentAgent()?.name || 'AI 助手')));
        if (message.createdAt) {
            meta.appendChild(createElement('span', '', formatTime(message.createdAt)));
        }
        if (message.role === 'user' && editable) {
            const editButton = createElement('button', 'message-edit-button');
            editButton.type = 'button';
            editButton.title = '编辑并重发';
            editButton.setAttribute('aria-label', '编辑并重发这条消息');
            editButton.appendChild(createIcon('fa-solid fa-pen'));
            if (state.editingMessageId === message.id) {
                editButton.classList.add('is-active');
            }
            editButton.addEventListener('click', () => editMessage(message));
            meta.appendChild(editButton);
        }
        const content = createElement('div', 'message-content');
        renderSafeMessageContent(content, message);
        column.append(meta, content);

        const stateText = getMessageStateText(message);
        if (stateText) {
            const stateRow = createElement('div', `message-state${message.status === 'error' ? ' is-error' : ''}`);
            if (message.status === 'pending' && !message.content) {
                const dots = createElement('span', 'typing-dots');
                dots.append(createElement('span'), createElement('span'), createElement('span'));
                stateRow.append(dots);
            }
            stateRow.appendChild(createElement('span', '', stateText));
            if (message.status === 'error' || message.status === 'cancelled') {
                const retry = createElement('button', 'retry-message-button', '重试');
                retry.type = 'button';
                retry.addEventListener('click', () => retryMessage(message));
                stateRow.appendChild(retry);
            }
            column.appendChild(stateRow);
        }

        const knowledgeBadge = renderMessageKnowledgeBadge(message);
        if (knowledgeBadge) {
            column.appendChild(knowledgeBadge);
        }

        const toolStepsNode = renderMessageToolSteps(message);
        if (toolStepsNode) {
            column.appendChild(toolStepsNode);
        }

        row.appendChild(column);
        return row;
    }

    function renderMessageToolSteps(message) {
        const steps = message && Array.isArray(message.toolSteps) ? message.toolSteps : [];
        if (steps.length === 0) {
            return null;
        }
        const wrapper = createElement('div', 'tool-steps-row');
        steps.forEach((step) => {
            const label = TOOL_STEP_LABELS[step.name] || step.name || '工具';
            const chip = createElement('span', `tool-step-chip${step.ok ? '' : ' is-failed'}`);
            chip.textContent = `${label}${step.ok ? ' ✓' : ' ✗'}`;
            wrapper.appendChild(chip);
        });
        return wrapper;
    }

    function renderMessageKnowledgeBadge(message) {
        const provenance = message && message.knowledgeProvenance;
        if (!provenance || !Array.isArray(provenance.skillCodes) || provenance.skillCodes.length === 0) {
            return null;
        }
        const wrapper = createElement('div', 'knowledge-badge-row');
        const badge = createElement('span', 'knowledge-badge');
        if (provenance.truncated) {
            badge.classList.add('is-truncated');
        }
        const truncatedSuffix = provenance.truncated ? '（已截断）' : '';
        badge.textContent = `已注入 · ${provenance.skillCodes.length} 项技能${truncatedSuffix}`;

        const details = document.createElement('details');
        details.className = 'knowledge-provenance';
        const summary = createElement('summary', '', '知识溯源');
        details.appendChild(summary);
        const list = createElement('ul', 'knowledge-provenance-list');
        provenance.skillCodes.forEach((code) => {
            list.appendChild(createElement('li', '', code));
        });
        details.appendChild(list);
        if (Array.isArray(provenance.referenceIds) && provenance.referenceIds.length > 0) {
            details.appendChild(createElement('p', 'knowledge-provenance-refs', `引用 ${provenance.referenceIds.length} 份`));
        }
        wrapper.append(badge, details);
        return wrapper;
    }

    function renderKnowledgeCatalog() {
        const list = elements.knowledgeCatalogList;
        if (!list) {
            return;
        }
        list.replaceChildren();
        const knowledge = state.knowledge;
        const summaryEl = elements.knowledgeCatalogSummary;
        if (!knowledge || !Array.isArray(knowledge.skills) || knowledge.skills.length === 0) {
            if (summaryEl) {
                summaryEl.textContent = '';
            }
            list.appendChild(createElement('p', 'knowledge-hint', '暂无可用知识技能。'));
            return;
        }
        if (summaryEl) {
            summaryEl.textContent = `${knowledge.totalSkills} 技能 · ${knowledge.totalReferences} 引用`;
        }
        knowledge.skills.forEach((skill) => {
            const item = createElement('div', 'knowledge-catalog-item');
            item.setAttribute('role', 'listitem');
            const name = createElement('strong', '', skill.name);
            const metaText = `${skill.referenceCount} 引用 · ${skill.evidenceLevel || '未标注'} · ${skill.riskLevel || '常规'} · v${skill.contentVersion || '0'}`;
            item.append(name, createElement('span', 'knowledge-catalog-meta', metaText));
            if (skill.license) {
                item.appendChild(createElement('span', 'knowledge-catalog-license', skill.license));
            }
            list.appendChild(item);
        });
    }

    async function loadAgentGovernance() {
        if (!elements.agentGovernanceList) {
            return;
        }
        try {
            const data = unwrap(await api.listAgentsForGovernance(), '加载智能体列表失败。');
            state.allAgents = Array.isArray(data) ? data : [];
        } catch (error) {
            state.allAgents = [];
            showStatus(normalizeError(error, '加载智能体列表失败。').message, 'error');
        }
        renderAgentGovernance();
    }

    function renderAgentGovernance() {
        const list = elements.agentGovernanceList;
        if (!list) {
            return;
        }
        list.replaceChildren();
        const agents = Array.isArray(state.allAgents) ? state.allAgents : [];
        if (agents.length === 0) {
            list.appendChild(createElement('p', 'knowledge-hint', '暂无智能体。'));
            return;
        }
        agents.forEach((agent) => list.appendChild(renderAgentGovernanceItem(agent)));
    }

    function renderAgentGovernanceItem(agent) {
        const item = createElement('div', 'agent-governance-item');
        item.setAttribute('role', 'listitem');
        item.dataset.agentCode = agent.code;

        const header = createElement('div', 'agent-governance-header');
        header.appendChild(createElement('strong', '', agent.displayName || agent.name));
        header.appendChild(createElement(
            'span',
            agent.sourceType === 'custom' ? 'source-badge is-custom' : 'source-badge',
            agent.sourceType === 'custom' ? '自定义' : '内置'
        ));

        const toggleLabel = createElement('label', 'toggle-row compact-toggle');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(agent.enabled);
        checkbox.addEventListener('change', () => toggleAgentEnabled(agent.code, checkbox.checked));
        toggleLabel.append(checkbox, createElement('span', 'toggle', ''), createElement('span', '', agent.enabled ? '已启用' : '已停用'));

        const toolsLabel = createElement('label', 'toggle-row compact-toggle tools-toggle');
        const toolsCheckbox = document.createElement('input');
        toolsCheckbox.type = 'checkbox';
        toolsCheckbox.checked = Boolean(agent.toolsEnabled);
        toolsCheckbox.addEventListener('change', () => toggleAgentToolsEnabled(agent.code, toolsCheckbox.checked));
        toolsLabel.append(
            toolsCheckbox,
            createElement('span', 'toggle', ''),
            createElement('span', '', agent.toolsEnabled ? '工具已启用（回复不再逐字流式）' : '启用只读工具')
        );

        const actions = createElement('div', 'agent-governance-actions');
        const bindButton = createElement('button', 'secondary-button compact-button', '技能绑定');
        bindButton.type = 'button';
        bindButton.addEventListener('click', () => toggleBindingEditor(agent, item));
        actions.appendChild(bindButton);
        if (agent.sourceType === 'custom') {
            const editButton = createElement('button', 'secondary-button compact-button', '编辑');
            editButton.type = 'button';
            editButton.addEventListener('click', () => openCustomAgentDialog(agent));
            const deleteButton = createElement('button', 'danger-quiet-button compact-button', '删除');
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', () => removeCustomAgent(agent));
            actions.append(editButton, deleteButton);
        }

        item.append(header, toggleLabel, toolsLabel, actions);
        return item;
    }

    async function toggleAgentToolsEnabled(code, enabled) {
        try {
            await api.setAgentToolsEnabled({ code, enabled });
            state.allAgents = state.allAgents.map((agent) => (agent.code === code ? { ...agent, toolsEnabled: enabled } : agent));
            renderAgentGovernance();
            showStatus(enabled ? '已为该智能体启用只读工具。' : '已停用该智能体的工具。', 'success', 1600);
        } catch (error) {
            showStatus(normalizeError(error, '更新工具开关失败。').message, 'error');
            await loadAgentGovernance();
        }
    }

    async function toggleAgentEnabled(code, enabled) {
        try {
            await api.setAgentEnabled({ code, enabled });
            state.allAgents = state.allAgents.map((agent) => (agent.code === code ? { ...agent, enabled } : agent));
            state.agents = state.allAgents.filter((agent) => agent.enabled);
            renderAgentGovernance();
            renderAgentSwitcher();
            renderConversationView();
            showStatus(enabled ? '已启用该智能体。' : '已停用该智能体。', 'success', 1600);
        } catch (error) {
            showStatus(normalizeError(error, '更新启用状态失败。').message, 'error');
            await loadAgentGovernance();
        }
    }

    async function toggleBindingEditor(agent, item) {
        const existing = item.querySelector('.agent-binding-editor');
        if (existing) {
            existing.remove();
            return;
        }
        const editor = createElement('div', 'agent-binding-editor');
        editor.appendChild(createElement('p', 'knowledge-hint', '正在加载技能绑定…'));
        item.appendChild(editor);
        try {
            const bindings = unwrap(await api.listAgentSkills({ agentCode: agent.code }), '加载技能绑定失败。');
            renderAgentBindingEditor(agent, editor, Array.isArray(bindings) ? bindings : []);
        } catch (error) {
            editor.replaceChildren(createElement('p', 'knowledge-hint', normalizeError(error, '加载技能绑定失败。').message));
        }
    }

    function describeReferenceIds(referenceIds, total) {
        if (referenceIds === null || referenceIds === undefined) {
            return total > 0 ? `全部 ${total} 引用` : '仅正文';
        }
        if (Array.isArray(referenceIds) && referenceIds.length === 0) {
            return '仅正文';
        }
        return `${referenceIds.length} 引用`;
    }

    function renderAgentBindingEditor(agent, container, bindings) {
        container.replaceChildren();
        const skills = (state.knowledge && Array.isArray(state.knowledge.skills)) ? state.knowledge.skills : [];
        if (skills.length === 0) {
            container.appendChild(createElement('p', 'knowledge-hint', '暂无可用知识技能。'));
            return;
        }
        const bindingBySkill = new Map(bindings.map((binding) => [binding.skillCode, binding]));
        skills.forEach((skill) => {
            const binding = bindingBySkill.get(skill.code);
            const row = createElement('div', 'agent-binding-row');
            const label = createElement('label', 'agent-binding-toggle');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(binding && binding.enabled);
            checkbox.addEventListener('change', () => saveAgentBinding(agent.code, skill.code, checkbox.checked, container));
            const refText = describeReferenceIds(binding ? binding.referenceIds : undefined, skill.referenceCount);
            label.append(checkbox, createElement('span', 'agent-binding-refs', `${skill.name} · ${refText}`));
            row.appendChild(label);
            container.appendChild(row);
        });
        if (agent.sourceType === 'builtin') {
            const reset = createElement('button', 'secondary-button compact-button', '重置为内置绑定');
            reset.type = 'button';
            reset.addEventListener('click', () => resetAgentBindings(agent.code, container));
            container.appendChild(reset);
        }
    }

    async function saveAgentBinding(agentCode, skillCode, mounted, container) {
        try {
            if (mounted) {
                await api.updateAgentSkillBinding({ agentCode, skillCode, referenceIds: null });
            } else {
                await api.deleteAgentSkillBinding({ agentCode, skillCode });
            }
            showStatus(mounted ? '已挂载技能。' : '已卸载技能。', 'success', 1500);
            const bindings = unwrap(await api.listAgentSkills({ agentCode }), '加载技能绑定失败。');
            const agent = state.allAgents.find((item) => item.code === agentCode);
            renderAgentBindingEditor(agent, container, Array.isArray(bindings) ? bindings : []);
        } catch (error) {
            showStatus(normalizeError(error, '保存技能绑定失败。').message, 'error');
        }
    }

    async function resetAgentBindings(agentCode, container) {
        try {
            const bindings = await api.resetBuiltinAgentBindings({ agentCode });
            showStatus('已重置为内置绑定。', 'success', 1500);
            const agent = state.allAgents.find((item) => item.code === agentCode);
            renderAgentBindingEditor(agent, container, Array.isArray(bindings) ? bindings : []);
        } catch (error) {
            showStatus(normalizeError(error, '重置失败。').message, 'error');
        }
    }

    async function removeCustomAgent(agent) {
        try {
            const result = unwrap(await api.deleteCustomAgent({ code: agent.code }), '删除失败。');
            if (result && result.deleted) {
                showStatus('已删除自定义智能体。', 'success', 1600);
                await loadAgentGovernance();
            } else {
                showStatus('该智能体仍有会话，请先删除相关会话。', 'warning');
            }
        } catch (error) {
            showStatus(normalizeError(error, '删除失败。').message, 'error');
        }
    }

    function appendFormField(form, label, type) {
        const wrapper = createElement('label', 'form-field');
        wrapper.appendChild(createElement('span', '', label));
        const input = document.createElement('input');
        input.type = type;
        input.required = true;
        wrapper.appendChild(input);
        form.appendChild(wrapper);
        return input;
    }

    function openCustomAgentDialog(existing) {
        const dialog = document.createElement('dialog');
        dialog.className = 'agent-editor-dialog';
        const form = document.createElement('form');
        form.method = 'dialog';
        form.appendChild(createElement('h3', '', existing ? '编辑自定义智能体' : '新建自定义智能体'));

        const codeInput = appendFormField(form, '标识（小写字母/数字/_/-）', 'text');
        codeInput.value = existing ? existing.code : `custom-${Date.now().toString(36)}`;
        codeInput.disabled = Boolean(existing);
        const nameInput = appendFormField(form, '名称', 'text');
        nameInput.value = existing ? (existing.displayName || existing.name) : '';
        const taglineInput = appendFormField(form, '一句话定位（可选）', 'text');
        taglineInput.value = existing ? (existing.tagline || '') : '';

        const promptLabel = createElement('label', 'form-field');
        promptLabel.appendChild(createElement('span', '', '系统提示词'));
        const promptInput = document.createElement('textarea');
        promptInput.rows = 6;
        promptInput.required = true;
        promptInput.value = existing ? (existing.systemPrompt || '') : '';
        promptLabel.appendChild(promptInput);
        form.appendChild(promptLabel);

        const actions = createElement('div', 'split-actions');
        const cancel = createElement('button', 'secondary-button', '取消');
        cancel.type = 'button';
        cancel.addEventListener('click', () => dialog.close());
        const submit = createElement('button', 'primary-button', existing ? '保存' : '创建');
        submit.type = 'submit';
        actions.append(cancel, submit);
        form.appendChild(actions);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            const payload = {
                code: codeInput.value.trim(),
                name: nameInput.value.trim(),
                tagline: taglineInput.value.trim(),
                systemPrompt: promptInput.value,
            };
            try {
                if (existing) {
                    await api.updateCustomAgent(payload);
                } else {
                    await api.createCustomAgent(payload);
                }
                dialog.close();
                showStatus(existing ? '已保存修改。' : '已创建自定义智能体。', 'success', 1600);
                await loadAgentGovernance();
            } catch (error) {
                submit.disabled = false;
                showStatus(normalizeError(error, '保存失败。').message, 'error');
            }
        });
        dialog.appendChild(form);
        document.body.appendChild(dialog);
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
    }

    function createCustomAgent() {
        openCustomAgentDialog(null);
    }

    function isNearBottom() {
        return elements.messageScroll.scrollHeight - elements.messageScroll.scrollTop - elements.messageScroll.clientHeight < 180;
    }

    function scrollToBottom(force = false) {
        if (force || isNearBottom()) {
            elements.messageScroll.scrollTop = elements.messageScroll.scrollHeight;
        }
    }

    function renderMessages(forceScroll = false) {
        elements.messageList.replaceChildren();
        const busy = isBusy();
        let lastUserIndex = -1;
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
            if (state.messages[index].role === 'user') {
                lastUserIndex = index;
                break;
            }
        }
        state.messages.forEach((message, index) => {
            const editable = index === lastUserIndex && !busy;
            elements.messageList.appendChild(renderMessage(message, editable));
        });
        scrollToBottom(forceScroll);
    }

    function renderConversationView(forceScroll = false) {
        const hasConversation = Boolean(currentConversation());
        const hasMessages = hasConversation && state.messages.length > 0;
        elements.emptyWorkspace.hidden = hasMessages;
        elements.messageList.hidden = !hasMessages;
        if (!hasMessages) {
            renderAgentGrid();
        } else {
            renderMessages(forceScroll);
        }
        renderCurrentAgent();
        renderAgentSwitcher();
        updateComposerState();
    }

    function updateComposerState() {
        const hasConversation = Boolean(currentConversation());
        const busy = Boolean(state.activeRequest || state.startingConversationId);
        const provider = getProvider(state.preference?.currentProviderCode);
        const supportsVision = Boolean(provider && provider.supportsVision);
        const hasAttachments = state.currentAttachments.length > 0;
        elements.messageInput.disabled = !hasConversation || busy;
        elements.sendButton.disabled = !hasConversation || busy || !elements.messageInput.value.trim()
            || (hasAttachments && !supportsVision);
        elements.stopButton.hidden = !busy;
        elements.stopButton.disabled = !state.activeRequest;
        if (elements.attachImageButton) {
            elements.attachImageButton.disabled = !hasConversation || busy || !supportsVision;
            elements.attachImageButton.title = supportsVision ? '添加图片' : '当前模型不支持图片';
        }
        elements.messageInput.placeholder = hasConversation
            ? (busy ? '正在生成回复…' : '写下你想讨论的课堂情境')
            : '先选择一位助手';
    }

    function renderProviderSegments() {
        elements.providerSegments.replaceChildren();
        state.providers.forEach((provider) => {
            const button = createElement('button', 'provider-segment', provider.name);
            button.type = 'button';
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', String(provider.code === state.providerCode));
            button.addEventListener('click', () => {
                state.providerCode = provider.code;
                renderProviderSettings();
            });
            elements.providerSegments.appendChild(button);
        });
    }

    function clearProviderFieldErrors() {
        [elements.providerBaseUrl, elements.endpointInput].forEach((input) => {
            if (input) {
                input.removeAttribute('aria-invalid');
            }
        });
        elements.providerBaseUrlError.textContent = '';
        elements.providerModelError.textContent = '';
    }

    function renderProviderSettings() {
        const provider = getProvider(state.providerCode) || state.providers[0];
        if (!provider) {
            return;
        }
        state.providerCode = provider.code;
        renderProviderSegments();
        clearProviderFieldErrors();
        elements.providerBaseUrl.value = provider.baseUrl || '';
        const isVolcengine = provider.code === 'volcengine';
        elements.providerModelLabel.textContent = isVolcengine ? '接入点 ID' : '模型';
        elements.endpointInput.placeholder = isVolcengine ? '例如 ep-2024…' : '例如 model-name';
        state.draftEndpoints = Array.isArray(provider.endpoints) ? [...provider.endpoints] : [];
        state.draftActiveEndpoint = provider.activeEndpoint || (state.draftEndpoints[0] || '');
        elements.endpointInput.value = '';
        renderEndpointList();
        elements.providerApiKey.value = '';
        elements.providerSupportsVision.checked = Boolean(provider.supportsVision);
        elements.providerKeyStatus.textContent = provider.hasApiKey ? '已配置' : '未配置';
        elements.providerKeyStatus.classList.toggle('is-configured', Boolean(provider.hasApiKey));
    }

    function renderEndpointList() {
        const list = elements.endpointList;
        if (!list) {
            return;
        }
        list.replaceChildren();
        state.draftEndpoints.forEach((value) => {
            const isActive = value === state.draftActiveEndpoint;
            const item = createElement('li', `endpoint-item${isActive ? ' is-active' : ''}`);
            item.setAttribute('role', 'listitem');

            const radio = createElement('span', 'endpoint-radio');
            radio.setAttribute('aria-hidden', 'true');
            item.appendChild(radio);

            item.appendChild(createElement('span', 'endpoint-name', value));

            if (isActive) {
                item.appendChild(createElement('span', 'endpoint-tag', '当前'));
            } else {
                const useButton = createElement('button', 'endpoint-action', '设为当前');
                useButton.type = 'button';
                useButton.addEventListener('click', () => setActiveEndpoint(value));
                item.appendChild(useButton);
            }

            const removeButton = createElement('button', 'endpoint-action is-remove', '删除');
            removeButton.type = 'button';
            removeButton.addEventListener('click', () => removeEndpoint(value));
            item.appendChild(removeButton);

            list.appendChild(item);
        });
    }

    function addEndpoint() {
        const value = (elements.endpointInput.value || '').trim();
        if (!value) {
            return;
        }
        if (value.length > 200) {
            elements.providerModelError.textContent = '单个接入点/模型不能超过 200 字符。';
            elements.endpointInput.setAttribute('aria-invalid', 'true');
            return;
        }
        if (state.draftEndpoints.includes(value)) {
            elements.endpointInput.value = '';
            return;
        }
        clearProviderFieldErrors();
        state.draftEndpoints.push(value);
        if (!state.draftActiveEndpoint) {
            state.draftActiveEndpoint = value;
        }
        elements.endpointInput.value = '';
        renderEndpointList();
    }

    function setActiveEndpoint(value) {
        if (!state.draftEndpoints.includes(value)) {
            return;
        }
        state.draftActiveEndpoint = value;
        renderEndpointList();
    }

    function removeEndpoint(value) {
        const index = state.draftEndpoints.indexOf(value);
        if (index === -1) {
            return;
        }
        state.draftEndpoints.splice(index, 1);
        if (state.draftActiveEndpoint === value) {
            state.draftActiveEndpoint = state.draftEndpoints[0] || '';
        }
        renderEndpointList();
    }

    function renderBudget() {
        const preference = state.preference;
        const usage = state.usage;
        if (!preference || !usage) {
            return;
        }
        elements.usageMonth.textContent = usage.month || '';
        elements.usageTotal.textContent = formatNumber(usage.totalTokens);
        elements.usageLimitText.textContent = `/ ${formatNumber(preference.monthlyTokenLimit)} Tokens`;
        elements.monthlyTokenLimit.value = String(preference.monthlyTokenLimit);
        elements.hardLimitEnabled.checked = preference.hardLimitEnabled;
        const limit = Math.max(1, Number(preference.monthlyTokenLimit) || 0);
        const percentage = preference.monthlyTokenLimit > 0
            ? Math.min(100, (Number(usage.totalTokens || 0) / preference.monthlyTokenLimit) * 100)
            : 0;
        elements.usageProgress.max = limit;
        elements.usageProgress.value = Math.min(limit, Number(usage.totalTokens || 0));
        elements.usageProgress.classList.toggle('is-over-limit', Number(usage.totalTokens || 0) >= preference.monthlyTokenLimit && preference.monthlyTokenLimit > 0);
        elements.usageProgress.setAttribute('aria-valuetext', `${percentage.toFixed(1)}%`);
    }

    function renderPrivacyStatus() {
        const accepted = Boolean(state.preference?.privacyAccepted);
        elements.privacyStatusText.textContent = accepted ? '已确认当前版本隐私告知' : '首次发送时确认';
    }

    function renderSettings() {
        renderProviderSettings();
        renderBudget();
        renderPrivacyStatus();
        renderCurrentAgent();
        renderKnowledgeSectionVisibility();
        renderAgentGovernanceVisibility();
        renderBudgetSectionVisibility();
    }

    function renderKnowledgeSectionVisibility() {
        if (!elements.knowledgeSection) {
            return;
        }
        // 系统级开关：由「系统维护」统一放行，AI 面板只读反映，不暴露开关。
        elements.knowledgeSection.hidden = !Boolean(state.features?.knowledgeSectionVisible);
    }

    function renderAgentGovernanceVisibility() {
        if (!elements.agentGovernanceSection) {
            return;
        }
        // 系统级开关：由「系统维护」统一放行，AI 面板只读反映，不暴露开关。
        elements.agentGovernanceSection.hidden = !Boolean(state.features?.agentManagementEnabled);
    }

    function renderBudgetSectionVisibility() {
        if (!elements.budgetSection) {
            return;
        }
        // 系统级开关：由「系统维护」统一放行，AI 面板只读反映，不暴露开关。
        elements.budgetSection.hidden = !Boolean(state.features?.budgetSectionVisible);
    }

    function updateCharacterCount() {
        const length = elements.messageInput.value.length;
        elements.characterCount.textContent = `${formatNumber(length)} / ${formatNumber(MAX_MESSAGE_LENGTH)}`;
        elements.sendButton.disabled = !currentConversation() || Boolean(state.activeRequest || state.startingConversationId) || !elements.messageInput.value.trim();
    }

    function resizeMessageInput() {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = `${Math.min(160, Math.max(38, elements.messageInput.scrollHeight))}px`;
    }

    function updateConversationRecord(conversation) {
        if (!conversation) {
            return;
        }
        const index = state.conversations.findIndex((item) => item.id === conversation.id);
        if (index === -1) {
            state.conversations.unshift(conversation);
        } else {
            state.conversations[index] = { ...state.conversations[index], ...conversation };
        }
        state.conversations.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    async function cancelActiveRequest() {
        if (!state.activeRequest) {
            if (state.startingConversationId) {
                state.cancelStartingRequested = true;
            }
            state.startingConversationId = null;
            return;
        }
        const active = state.activeRequest;
        try {
            await api.cancelChat(active.requestId, active.conversationId);
        } catch {
            // The Main process also cancels requests when the window closes.
        }
        const message = findAssistantMessage();
        if (message) {
            message.status = 'cancelled';
            message.errorKind = 'cancelled';
        }
        state.activeRequest = null;
        state.startingConversationId = null;
        updateComposerState();
        if (state.currentConversationId === active.conversationId) {
            renderMessages();
        }
    }

    async function selectConversation(conversationId) {
        if (conversationId === state.currentConversationId && !state.activeRequest) {
            closePanels();
            return;
        }
        await cancelActiveRequest();
        clearAttachments();
        resetEditingState();
        state.currentConversationId = conversationId;
        state.messages = [];
        renderConversations();
        renderConversationView();
        closePanels();
        try {
            const messages = unwrap(await api.listMessages({ conversationId, limit: 200 }), '无法加载会话消息。');
            if (state.currentConversationId === conversationId) {
                state.messages = Array.isArray(messages) ? messages : [];
                renderConversationView(true);
            }
        } catch (error) {
            showStatus(normalizeError(error, '无法加载会话消息。').message, 'error');
        }
    }

    async function beginNewConversation() {
        await cancelActiveRequest();
        resetEditingState();
        state.currentConversationId = null;
        state.messages = [];
        renderConversations();
        renderConversationView();
        closePanels();
        elements.messageInput.value = '';
        updateCharacterCount();
        elements.messageInput.focus();
    }

    async function chooseAgent(agentCode, starterPrompt = '') {
        const agent = getAgent(agentCode);
        if (!agent) {
            return;
        }
        closeAgentSwitcher();
        if (!currentConversation() || currentConversation().agentCode !== agentCode) {
            await cancelActiveRequest();
            resetEditingState();
            try {
                const conversation = unwrap(await api.createConversation({ agentCode }), '无法创建会话。');
                updateConversationRecord(conversation);
                state.currentConversationId = conversation.id;
                state.messages = [];
                renderConversations();
                renderConversationView();
            } catch (error) {
                showStatus(normalizeError(error, '无法创建会话。').message, 'error');
                return;
            }
        }
        if (starterPrompt) {
            elements.messageInput.value = starterPrompt;
            updateCharacterCount();
            resizeMessageInput();
        }
        closePanels();
        elements.messageInput.focus();
    }

    async function renameConversation(conversation) {
        const title = window.prompt('请输入新的会话名称', conversation.title);
        if (title === null || !title.trim()) {
            return;
        }
        try {
            const updated = unwrap(await api.renameConversation(conversation.id, title.trim()), '无法重命名会话。');
            updateConversationRecord(updated);
            renderConversations();
            showStatus('会话名称已更新。', 'success', 2500);
        } catch (error) {
            showStatus(normalizeError(error, '无法重命名会话。').message, 'error');
        }
    }

    async function deleteConversation(conversation) {
        if (!window.confirm(`确定删除“${conversation.title}”及其中的消息吗？`)) {
            return;
        }
        await cancelActiveRequest();
        try {
            const deleted = unwrap(await api.deleteConversation(conversation.id), '无法删除会话。');
            if (!deleted) {
                return;
            }
            state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
            if (state.currentConversationId === conversation.id) {
                state.currentConversationId = null;
                state.messages = [];
            }
            renderConversations();
            renderConversationView();
            showStatus('会话已删除。', 'success', 2500);
        } catch (error) {
            showStatus(normalizeError(error, '无法删除会话。').message, 'error');
        }
    }

    function getPendingEventList(requestId) {
        const list = state.pendingEvents.get(requestId) || [];
        state.pendingEvents.set(requestId, list);
        return list;
    }

    function eventBelongsToActive(payload, eventName) {
        if (state.activeRequest?.requestId === payload.requestId) {
            return true;
        }
        if (state.startingConversationId === payload.conversationId) {
            getPendingEventList(payload.requestId).push({ eventName, payload });
        }
        return false;
    }

    function findAssistantMessage() {
        return state.activeRequest
            ? state.messages.find((message) => message.id === state.activeRequest.assistantMessageId)
            : null;
    }

    const TOOL_STEP_LABELS = {
        search_intervention_apps: '查询干预应用目录',
        query_usage_stats: '查询使用统计',
    };

    function handleToolStep(payload) {
        if (!payload?.requestId || !eventBelongsToActive(payload, 'toolStep')) {
            return;
        }
        const label = TOOL_STEP_LABELS[payload.name] || payload.name || '工具';
        showStatus(`工具调用：${label}${payload.ok ? '' : '（失败）'}…`, 'warning', 2000);
        const message = findAssistantMessage();
        if (message) {
            const steps = Array.isArray(message.toolSteps) ? message.toolSteps.slice() : [];
            steps.push({ name: payload.name, ok: payload.ok, round: payload.round });
            message.toolSteps = steps;
            renderMessages();
        }
    }

    function handleDelta(payload) {
        if (!payload?.requestId || !eventBelongsToActive(payload, 'delta')) {
            return;
        }
        const message = findAssistantMessage();
        if (!message || payload.conversationId !== state.currentConversationId) {
            return;
        }
        message.content = `${message.content || ''}${payload.delta || ''}`;
        message.status = 'pending';
        renderMessages();
    }

    function finishActiveRequest() {
        state.activeRequest = null;
        state.startingConversationId = null;
        updateComposerState();
    }

    function handleDone(payload) {
        if (!payload?.requestId || !eventBelongsToActive(payload, 'done')) {
            return;
        }
        const message = findAssistantMessage();
        if (message && payload.message) {
            Object.assign(message, payload.message);
        }
        if (message && payload.knowledge && payload.knowledge.provenance && !message.knowledgeProvenance) {
            message.knowledgeProvenance = payload.knowledge.provenance;
        }
        if (message && Array.isArray(payload.toolSteps)) {
            message.toolSteps = payload.toolSteps;
        }
        state.usage = payload.usage || state.usage;
        finishActiveRequest();
        renderMessages(true);
        renderBudget();
        showStatus('回复已完成。', 'success', 1800);
    }

    function handleError(payload) {
        if (!payload?.requestId || !eventBelongsToActive(payload, 'error')) {
            return;
        }
        const message = findAssistantMessage();
        if (message && payload.message) {
            Object.assign(message, payload.message);
        }
        const error = normalizeError(payload.error, '回复未完成，请重试。');
        finishActiveRequest();
        renderMessages(true);
        if (error.kind !== 'cancelled') {
            showStatus(error.message, 'error', 0);
        }
    }

    function flushPendingEvents(requestId) {
        const events = state.pendingEvents.get(requestId) || [];
        state.pendingEvents.delete(requestId);
        events.forEach(({ eventName, payload }) => {
            if (eventName === 'delta') {
                handleDelta(payload);
            } else if (eventName === 'done') {
                handleDone(payload);
            } else if (eventName === 'error') {
                handleError(payload);
            }
        });
    }

    async function sendContent(content, options = {}) {
        if (!state.currentConversationId || state.activeRequest || state.startingConversationId) {
            return;
        }
        const normalizedContent = String(content || '').trim();
        if (!normalizedContent) {
            updateCharacterCount();
            return;
        }
        const replaceFromMessageId = options.replaceFromMessageId || null;
        state.startingConversationId = state.currentConversationId;
        updateComposerState();
        try {
            const attachmentIds = state.currentAttachments.map((item) => item.id);
            const result = unwrap(await api.startChat({
                conversationId: state.currentConversationId,
                content: normalizedContent,
                attachmentIds,
                replaceFromMessageId,
            }), '无法开始回复。');
            clearAttachments();
            const requestWasCancelled = state.cancelStartingRequested
                || result.conversationId !== state.currentConversationId;
            state.cancelStartingRequested = false;
            state.activeRequest = {
                requestId: result.requestId,
                conversationId: result.conversationId,
                assistantMessageId: result.assistantMessage.id,
            };
            state.startingConversationId = null;
            if (requestWasCancelled) {
                try {
                    await api.cancelChat(result.requestId, result.conversationId);
                } catch {
                    // The request is already outside the active view; Main will clean it up.
                }
                state.activeRequest = null;
                state.editingMessageId = null;
                hideEditBanner();
                updateComposerState();
                state.pendingEvents.delete(result.requestId);
                return;
            }
            if (replaceFromMessageId) {
                // 编辑/重发：本地视图从锚点 user 消息起截断，再追加新生成的一对。
                const fromIndex = state.messages.findIndex((item) => item.id === replaceFromMessageId);
                state.messages = fromIndex >= 0
                    ? state.messages.slice(0, fromIndex)
                    : state.messages.filter((message) => message.id !== result.userMessage.id && message.id !== result.assistantMessage.id);
            } else {
                state.messages = state.messages.filter((message) => message.id !== result.userMessage.id && message.id !== result.assistantMessage.id);
            }
            state.messages.push(result.userMessage, result.assistantMessage);
            state.editingMessageId = null;
            hideEditBanner();
            updateConversationRecord(result.conversation);
            elements.messageInput.value = '';
            resizeMessageInput();
            updateCharacterCount();
            renderConversations();
            renderConversationView(true);
            flushPendingEvents(result.requestId);
        } catch (error) {
            state.startingConversationId = null;
            updateComposerState();
            // 预检失败（预算/Provider/隐私）时 DB 未截断，保留编辑态供用户修正后重试。
            showStatus(normalizeError(error, '无法开始回复。').message, 'error', 0);
        }
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new globalScope.FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('读取图片失败。'));
            reader.readAsDataURL(file);
        });
    }

    function renderAttachmentPreview() {
        const strip = elements.attachmentPreviewStrip;
        if (!strip) {
            return;
        }
        strip.replaceChildren();
        strip.hidden = state.currentAttachments.length === 0;
        state.currentAttachments.forEach((item) => {
            const chip = createElement('div', 'attachment-chip');
            const img = createElement('img', 'attachment-chip-image');
            img.src = item.previewDataUrl;
            img.alt = item.fileName;
            const remove = createElement('button', 'attachment-chip-remove', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', '移除图片');
            remove.addEventListener('click', () => removeAttachment(item.id));
            chip.append(img, remove);
            strip.appendChild(chip);
        });
    }

    async function removeAttachment(attachmentId) {
        state.currentAttachments = state.currentAttachments.filter((item) => item.id !== attachmentId);
        try {
            await api.deleteAttachment({ attachmentId });
        } catch {
            // best-effort：DB 软删，文件随会话删除回收。
        }
        renderAttachmentPreview();
        updateComposerState();
    }

    function clearAttachments() {
        state.currentAttachments = [];
        if (elements.imageFileInput) {
            elements.imageFileInput.value = '';
        }
        renderAttachmentPreview();
    }

    async function handleImageFiles(fileList) {
        const files = Array.from(fileList || []).filter((file) => file && file.type.startsWith('image/'));
        if (files.length === 0 || !state.currentConversationId) {
            return;
        }
        const provider = getProvider(state.preference?.currentProviderCode);
        if (!provider || !provider.supportsVision) {
            showStatus('当前模型不支持图片，请在设置中开启视觉能力。', 'error');
            return;
        }
        const remaining = 4 - state.currentAttachments.length;
        if (remaining <= 0) {
            showStatus('单次最多附带 4 张图片。', 'warning');
            return;
        }
        for (const file of files.slice(0, remaining)) {
            if (file.size > 5 * 1024 * 1024) {
                showStatus(`${file.name} 超过 5MB，已跳过。`, 'warning');
                continue;
            }
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const result = unwrap(await api.uploadAttachment({
                    conversationId: state.currentConversationId,
                    fileName: file.name,
                    dataUrl,
                }), '图片上传失败。');
                state.currentAttachments.push({
                    id: result.id,
                    previewDataUrl: result.previewDataUrl,
                    fileName: file.name,
                });
            } catch (error) {
                showStatus(normalizeError(error, '图片上传失败。').message, 'error');
            }
        }
        renderAttachmentPreview();
        updateComposerState();
    }

    async function requestSend() {
        const content = elements.messageInput.value.trim();
        if (!content || !currentConversation() || state.activeRequest || state.startingConversationId) {
            return;
        }
        if (!state.preference?.privacyAccepted) {
            state.pendingDraft = content;
            elements.privacyProviderName.textContent = getProvider(state.preference?.currentProviderCode)?.name || '所选模型服务';
            if (typeof elements.privacyDialog.showModal === 'function') {
                elements.privacyDialog.showModal();
            } else {
                elements.privacyDialog.setAttribute('open', '');
            }
            return;
        }
        await sendContent(content, { replaceFromMessageId: state.editingMessageId });
    }

    async function acceptPrivacy() {
        setButtonBusy(elements.acceptPrivacyButton, true, '正在确认…');
        try {
            state.preference = unwrap(await api.acceptPrivacy(), '隐私确认未保存。');
            if (typeof elements.privacyDialog.close === 'function') {
                elements.privacyDialog.close();
            } else {
                elements.privacyDialog.removeAttribute('open');
            }
            renderPrivacyStatus();
            const pendingDraft = state.pendingDraft;
            state.pendingDraft = '';
            if (pendingDraft) {
                await sendContent(pendingDraft);
            }
        } catch (error) {
            showStatus(normalizeError(error, '隐私确认未保存。').message, 'error');
        } finally {
            setButtonBusy(elements.acceptPrivacyButton, false);
        }
    }

    function declinePrivacy() {
        state.pendingDraft = '';
        if (typeof elements.privacyDialog.close === 'function') {
            elements.privacyDialog.close();
        } else {
            elements.privacyDialog.removeAttribute('open');
        }
        showStatus('未发送任何内容。', 'warning', 2500);
    }

    function showEditBanner() {
        if (elements.editBanner) {
            elements.editBanner.hidden = false;
        }
    }

    function hideEditBanner() {
        if (elements.editBanner) {
            elements.editBanner.hidden = true;
        }
    }

    // 切换会话/新建时丢弃编辑态（不触发表单重渲染，由调用方负责后续渲染）。
    function resetEditingState() {
        state.editingMessageId = null;
        hideEditBanner();
    }

    function editMessage(message) {
        if (isBusy() || !message || message.role !== 'user') {
            return;
        }
        state.editingMessageId = message.id;
        elements.messageInput.value = message.content || '';
        updateCharacterCount();
        resizeMessageInput();
        showEditBanner();
        renderMessages();
        elements.messageInput.focus();
    }

    function cancelEdit() {
        state.editingMessageId = null;
        hideEditBanner();
        if (elements.messageInput) {
            elements.messageInput.value = '';
            updateCharacterCount();
            resizeMessageInput();
        }
        if (state.messages.length > 0) {
            renderMessages();
        }
    }

    async function retryMessage(message) {
        if (isBusy()) {
            return;
        }
        const index = state.messages.findIndex((item) => item.id === message.id);
        const previous = index > 0 ? state.messages[index - 1] : null;
        if (!previous || previous.role !== 'user') {
            showStatus('找不到可重试的原消息。', 'error');
            return;
        }
        // 截断重发：从上一条 user 消息起替换，避免历史里出现重复的 user 消息。
        await sendContent(previous.content, { replaceFromMessageId: previous.id });
    }

    function validateProviderForm() {
        clearProviderFieldErrors();
        let valid = true;
        const baseUrl = elements.providerBaseUrl.value.trim();
        try {
            const url = new URL(baseUrl);
            if (url.protocol !== 'https:' || url.username || url.password) {
                throw new Error('invalid');
            }
        } catch {
            elements.providerBaseUrl.setAttribute('aria-invalid', 'true');
            elements.providerBaseUrlError.textContent = '请输入不含账号信息的 HTTPS 地址。';
            valid = false;
        }
        if (state.draftEndpoints.length === 0) {
            elements.providerModelError.textContent = '请至少添加一个模型或接入点 ID。';
            valid = false;
        }
        return valid;
    }

    async function saveProvider(event) {
        event.preventDefault();
        if (!validateProviderForm()) {
            return;
        }
        setButtonBusy(elements.saveProviderButton, true, '正在保存…');
        try {
            const provider = unwrap(await api.saveProvider({
                code: state.providerCode,
                baseUrl: elements.providerBaseUrl.value.trim(),
                endpoints: [...state.draftEndpoints],
                activeEndpoint: state.draftActiveEndpoint,
                apiKey: elements.providerApiKey.value,
                supportsVision: elements.providerSupportsVision.checked,
            }), 'Provider 配置未保存。');
            state.providers = state.providers.map((item) => item.code === provider.code ? provider : item);
            state.preference.currentProviderCode = provider.code;
            state.providerCode = provider.code;
            state.draftEndpoints = Array.isArray(provider.endpoints) ? [...provider.endpoints] : [];
            state.draftActiveEndpoint = provider.activeEndpoint || (state.draftEndpoints[0] || '');
            elements.providerApiKey.value = '';
            renderSettings();
            closePanels();
            showStatus(`${provider.name} 配置已保存。`, 'success', 2500);
        } catch (error) {
            showStatus(normalizeError(error, 'Provider 配置未保存。').message, 'error');
        } finally {
            setButtonBusy(elements.saveProviderButton, false);
        }
    }

    async function testProvider() {
        const provider = getProvider(state.providerCode);
        if (!provider?.hasApiKey) {
            showStatus('请先保存该 Provider 的 API Key。', 'warning');
            return;
        }
        setButtonBusy(elements.testProviderButton, true, '正在测试…');
        try {
            const result = unwrap(await api.testProvider(provider.code), '连接测试未完成。');
            closePanels();
            showStatus(result.message || '连接测试成功。', 'success', 3000);
        } catch (error) {
            showStatus(normalizeError(error, '连接测试未完成。').message, 'error', 0);
        } finally {
            setButtonBusy(elements.testProviderButton, false);
        }
    }

    async function clearProvider() {
        const provider = getProvider(state.providerCode);
        if (!provider?.hasApiKey || !window.confirm(`确定清除 ${provider.name} 的 API Key 吗？`)) {
            return;
        }
        setButtonBusy(elements.clearProviderButton, true, '正在清除…');
        try {
            const updated = unwrap(await api.clearProvider(provider.code), 'API Key 未清除。');
            state.providers = state.providers.map((item) => item.code === updated.code ? updated : item);
            renderSettings();
            closePanels();
            showStatus('API Key 已清除。', 'success', 2500);
        } catch (error) {
            showStatus(normalizeError(error, 'API Key 未清除。').message, 'error');
        } finally {
            setButtonBusy(elements.clearProviderButton, false);
        }
    }

    async function saveBudget(event) {
        event.preventDefault();
        const monthlyTokenLimit = Number(elements.monthlyTokenLimit.value);
        if (!Number.isInteger(monthlyTokenLimit) || monthlyTokenLimit < 0 || monthlyTokenLimit > 1000000000) {
            elements.monthlyTokenLimit.setAttribute('aria-invalid', 'true');
            elements.monthlyTokenLimitError.textContent = '请输入 0 到 1,000,000,000 之间的整数。';
            return;
        }
        elements.monthlyTokenLimit.removeAttribute('aria-invalid');
        elements.monthlyTokenLimitError.textContent = '';
        setButtonBusy(elements.saveBudgetButton, true, '正在保存…');
        try {
            const result = unwrap(await api.updateBudget({
                monthlyTokenLimit,
                hardLimitEnabled: elements.hardLimitEnabled.checked,
            }), '额度设置未保存。');
            state.preference = result.preference;
            state.usage = result.usage;
            renderBudget();
            closePanels();
            showStatus('额度设置已保存。', 'success', 2500);
        } catch (error) {
            showStatus(normalizeError(error, '额度设置未保存。').message, 'error');
        } finally {
            setButtonBusy(elements.saveBudgetButton, false);
        }
    }

    function bindEvents() {
        elements.newConversationButton.addEventListener('click', beginNewConversation);
        elements.noticeCloseButton.addEventListener('click', hideStatus);
        elements.openConversationPanelButton.addEventListener('click', () => openPanel('conversations'));
        elements.closeConversationPanelButton.addEventListener('click', closePanels);
        elements.switchAgentButton.addEventListener('click', toggleAgentSwitcher);
        elements.openSettingsPanelButton.addEventListener('click', () => openPanel('settings'));
        elements.closeSettingsPanelButton.addEventListener('click', closePanels);
        if (elements.createAgentButton) {
            elements.createAgentButton.addEventListener('click', () => createCustomAgent());
        }
        if (elements.editBannerCancel) {
            elements.editBannerCancel.addEventListener('click', cancelEdit);
        }
        if (elements.attachImageButton) {
            elements.attachImageButton.addEventListener('click', () => {
                if (elements.imageFileInput) {
                    elements.imageFileInput.click();
                }
            });
        }
        if (elements.imageFileInput) {
            elements.imageFileInput.addEventListener('change', (event) => {
                handleImageFiles(event.target.files);
                elements.imageFileInput.value = '';
            });
        }
        elements.panelBackdrop.addEventListener('click', closePanels);
        elements.providerForm.addEventListener('submit', saveProvider);
        elements.testProviderButton.addEventListener('click', testProvider);
        elements.clearProviderButton.addEventListener('click', clearProvider);
        elements.addEndpointButton.addEventListener('click', addEndpoint);
        elements.endpointInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addEndpoint();
            }
        });
        elements.budgetForm.addEventListener('submit', saveBudget);
        elements.sendButton.addEventListener('click', requestSend);
        elements.stopButton.addEventListener('click', async () => {
            if (!state.activeRequest) {
                return;
            }
            elements.stopButton.disabled = true;
            try {
                await api.cancelChat(state.activeRequest.requestId, state.activeRequest.conversationId);
                showStatus('正在停止回复…', 'warning', 2200);
            } catch (error) {
                elements.stopButton.disabled = false;
                showStatus(normalizeError(error, '停止请求失败。').message, 'error');
            }
        });
        elements.messageInput.addEventListener('input', () => {
            updateCharacterCount();
            resizeMessageInput();
        });
        elements.messageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                requestSend();
            }
        });
        elements.declinePrivacyButton.addEventListener('click', declinePrivacy);
        elements.acceptPrivacyButton.addEventListener('click', acceptPrivacy);
        elements.retryBootstrapButton.addEventListener('click', bootstrap);
        document.addEventListener('click', (event) => {
            if (elements.agentSwitcher.hidden
                || elements.switchAgentButton.contains(event.target)
                || elements.agentSwitcher.contains(event.target)) {
                return;
            }
            closeAgentSwitcher();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePanels();
            }
        });

        const unsubscribeDelta = api.onChatDelta(handleDelta);
        const unsubscribeDone = api.onChatDone(handleDone);
        const unsubscribeError = api.onChatError(handleError);
        const unsubscribeToolStep = api.onChatToolStep(handleToolStep);
        globalScope.addEventListener('beforeunload', () => {
            unsubscribeDelta?.();
            unsubscribeDone?.();
            unsubscribeError?.();
            unsubscribeToolStep?.();
            if (state.activeRequest) {
                api.cancelChat(state.activeRequest.requestId, state.activeRequest.conversationId).catch(() => {});
            }
        }, { once: true });
    }

    async function bootstrap() {
        showInitializing('正在准备 AI 工作台');
        try {
            const data = unwrap(await api.bootstrap(), 'AI 工作台初始化失败。');
            state.agents = Array.isArray(data.agents) ? data.agents : [];
            state.providers = Array.isArray(data.providers) ? data.providers : [];
            state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
            state.preference = data.preference || null;
            state.usage = data.usage || null;
            state.knowledge = data.knowledge || null;
            state.features = data.features || null;
            state.providerCode = state.preference?.currentProviderCode || state.providers[0]?.code || null;
            state.bootstrapped = true;
            elements.initializingLayer.hidden = true;
            renderConversations();
            renderSettings();
            renderKnowledgeCatalog();
            renderConversationView();
            if (state.conversations[0]) {
                await selectConversation(state.conversations[0].id);
            }
        } catch (error) {
            const normalized = normalizeError(error, 'AI 工作台初始化失败，请重试。');
            showInitializing(normalized.message, true);
        }
    }

    function handleMissingAPI() {
        showInitializing('AI 工作台通信接口不可用，请重启应用。', true);
    }

    function initialize() {
        cacheElements();
        if (!api) {
            handleMissingAPI();
            return;
        }
        bindEvents();
        updateCharacterCount();
        bootstrap();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize, { once: true });
        } else {
            initialize();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
