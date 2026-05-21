(function (globalScope) {
    function createAdvancedSettingsEntryGate(options = {}) {
        const threshold = Number.isInteger(options.threshold) && options.threshold > 0
            ? options.threshold
            : 3;
        const windowMs = Number.isInteger(options.windowMs) && options.windowMs > 0
            ? options.windowMs
            : 5000;
        const onTrigger = typeof options.onTrigger === 'function'
            ? options.onTrigger
            : null;

        let clickCount = 0;
        let timerId = null;

        function clearWindowTimer() {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
        }

        function reset() {
            clickCount = 0;
            clearWindowTimer();
        }

        function openFixedWindowIfNeeded() {
            if (timerId) {
                return;
            }

            timerId = setTimeout(() => {
                reset();
            }, windowMs);
        }

        function registerClick() {
            if (clickCount === 0) {
                openFixedWindowIfNeeded();
            }

            clickCount += 1;

            if (clickCount >= threshold) {
                reset();

                if (onTrigger) {
                    onTrigger();
                }

                return true;
            }

            return false;
        }

        function getState() {
            return {
                count: clickCount,
                isTimerActive: timerId !== null,
            };
        }

        return {
            registerClick,
            reset,
            getState,
        };
    }

    const api = {
        createAdvancedSettingsEntryGate,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (globalScope) {
        globalScope.createAdvancedSettingsEntryGate = createAdvancedSettingsEntryGate;
    }
})(typeof window !== 'undefined' ? window : globalThis);
