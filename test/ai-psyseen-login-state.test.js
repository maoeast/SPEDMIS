const {
  PSYSEEN_LOGIN_ERROR,
  PSYSEEN_LOGIN_TIMEOUT_ERROR,
  PsyseenLoginState,
  getPsyseenRoute,
} = require('../psyseen-login-state');

describe('PsyseenLoginState', () => {
  test('recognizes Psyseen login and dashboard hash routes', () => {
    expect(getPsyseenRoute('https://org.psyseen.com/#/login?redirect=%2Fdashboard')).toBe('login');
    expect(getPsyseenRoute('https://org.psyseen.com/#/dashboard')).toBe('dashboard');
    expect(getPsyseenRoute('https://example.com/#/dashboard')).toBeNull();
  });

  test('treats a return to login after submission as invalid credentials', () => {
    const state = new PsyseenLoginState();

    state.recordNavigation('https://org.psyseen.com/#/login?redirect=%2Fdashboard');
    expect(state.isFailed()).toBe(false);

    state.markSubmissionAttempted();
    state.recordNavigation('https://org.psyseen.com/#/login?redirect=%2Fdashboard');

    expect(state.isFailed()).toBe(true);
    expect(state.getError()).toBe(PSYSEEN_LOGIN_ERROR);
  });

  test('treats dashboard navigation as successful and preserves that result', () => {
    const state = new PsyseenLoginState();

    state.markSubmissionAttempted();
    state.recordNavigation('https://org.psyseen.com/#/dashboard');
    state.recordNavigation('https://org.psyseen.com/#/login?redirect=%2Fdashboard');

    expect(state.isSuccessful()).toBe(true);
  });

  test('uses a retryable error when no terminal route is observed', () => {
    const state = new PsyseenLoginState();

    expect(PSYSEEN_LOGIN_TIMEOUT_ERROR).toBe('登录失败，请检查网络或账号密码后重试');
    expect(state.getError()).toBe(PSYSEEN_LOGIN_TIMEOUT_ERROR);
  });
});
