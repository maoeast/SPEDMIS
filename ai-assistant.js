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
        activeRequest: null,
        startingConversationId: null,
        cancelStartingRequested: false,
        pendingEvents: new Map(),
        pendingDraft: '',
        noticeTimer: null,
        bootstrapped: false,
        allAgents: [],
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
            'characterCount',
            'stopButton',
            'sendButton',
            'providerSegments',
            'providerForm',
            'providerBaseUrl',
            'providerBaseUrlError',
            'providerModel',
            'providerModelLabel',
            'providerModelError',
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
        ].forEach((id) => {
            elements[id] = getElement(id);
        });
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

    function renderAgentGrid() {
        elements.agentGrid.replaceChildren();
        const agents = currentConversation() ? [currentAgent()].filter(Boolean) : state.agents;

        agents.forEach((agent) => {
            const card = createElement('article', 'agent-card');
            const avatar = createAgentAvatar(agent, 'agent-avatar', agent.name.slice(0, 1));

            const body = createElement('div', 'agent-card-body');
            body.appendChild(createElement('h3', '', agent.displayName || agent.name));
            body.appendChild(createElement('p', '', agent.tagline || agent.teacherSupport));

            const actions = createElement('div', 'agent-card-actions');
            const chooseButton = createElement('button', 'agent-select-button', currentConversation() ? '继续对话' : '开始使用');
            chooseButton.type = 'button';
            chooseButton.addEventListener('click', () => chooseAgent(agent.code));
            const starterButton = createElement('button', 'starter-button', agent.starterPrompts?.[0] || '从这里开始');
            starterButton.type = 'button';
            starterButton.title = starterButton.textContent;
            starterButton.addEventListener('click', () => {
                chooseAgent(agent.code, agent.starterPrompts?.[0] || '');
            });
            actions.append(chooseButton, starterButton);
            body.appendChild(actions);
            card.append(avatar, body);
            elements.agentGrid.appendChild(card);
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

    function renderMessage(message) {
        const row = createElement('article', `message-row is-${message.role}`);
        row.dataset.messageId = message.id;

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

        row.appendChild(column);
        return row;
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

        item.append(header, toggleLabel, actions);
        return item;
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
        state.messages.forEach((message) => {
            elements.messageList.appendChild(renderMessage(message));
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
        elements.messageInput.disabled = !hasConversation || busy;
        elements.sendButton.disabled = !hasConversation || busy || !elements.messageInput.value.trim();
        elements.stopButton.hidden = !busy;
        elements.stopButton.disabled = !state.activeRequest;
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
        [elements.providerBaseUrl, elements.providerModel].forEach((input) => input.removeAttribute('aria-invalid'));
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
        elements.providerModel.value = provider.model || '';
        elements.providerModelLabel.textContent = provider.code === 'volcengine' ? '接入点 ID' : '模型';
        elements.providerModel.placeholder = provider.code === 'volcengine' ? '例如 ep-2024…' : '例如 deepseek-chat';
        elements.providerApiKey.value = '';
        elements.providerKeyStatus.textContent = provider.hasApiKey ? '已配置' : '未配置';
        elements.providerKeyStatus.classList.toggle('is-configured', Boolean(provider.hasApiKey));
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
        state.usage = payload.usage || state.usage;
        renderMessages(true);
        renderBudget();
        finishActiveRequest();
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
        renderMessages(true);
        finishActiveRequest();
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

    async function sendContent(content) {
        if (!state.currentConversationId || state.activeRequest || state.startingConversationId) {
            return;
        }
        const normalizedContent = String(content || '').trim();
        if (!normalizedContent) {
            updateCharacterCount();
            return;
        }
        state.startingConversationId = state.currentConversationId;
        updateComposerState();
        try {
            const result = unwrap(await api.startChat({
                conversationId: state.currentConversationId,
                content: normalizedContent,
            }), '无法开始回复。');
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
                updateComposerState();
                state.pendingEvents.delete(result.requestId);
                return;
            }
            state.messages = state.messages.filter((message) => message.id !== result.userMessage.id && message.id !== result.assistantMessage.id);
            state.messages.push(result.userMessage, result.assistantMessage);
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
            showStatus(normalizeError(error, '无法开始回复。').message, 'error', 0);
        }
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
        await sendContent(content);
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

    async function retryMessage(message) {
        if (state.activeRequest || state.startingConversationId) {
            return;
        }
        const index = state.messages.findIndex((item) => item.id === message.id);
        const previous = index > 0 ? state.messages[index - 1] : null;
        if (!previous || previous.role !== 'user') {
            showStatus('找不到可重试的原消息。', 'error');
            return;
        }
        elements.messageInput.value = previous.content;
        updateCharacterCount();
        await requestSend();
    }

    function validateProviderForm() {
        clearProviderFieldErrors();
        let valid = true;
        const baseUrl = elements.providerBaseUrl.value.trim();
        const model = elements.providerModel.value.trim();
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
        if (!model || model.length > 200) {
            elements.providerModel.setAttribute('aria-invalid', 'true');
            elements.providerModelError.textContent = '请填写有效的模型或接入点 ID。';
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
                model: elements.providerModel.value.trim(),
                apiKey: elements.providerApiKey.value,
            }), 'Provider 配置未保存。');
            state.providers = state.providers.map((item) => item.code === provider.code ? provider : item);
            state.preference.currentProviderCode = provider.code;
            state.providerCode = provider.code;
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
        elements.panelBackdrop.addEventListener('click', closePanels);
        elements.providerForm.addEventListener('submit', saveProvider);
        elements.testProviderButton.addEventListener('click', testProvider);
        elements.clearProviderButton.addEventListener('click', clearProvider);
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
        globalScope.addEventListener('beforeunload', () => {
            unsubscribeDelta?.();
            unsubscribeDone?.();
            unsubscribeError?.();
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
