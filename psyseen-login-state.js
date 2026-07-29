const PSYSEEN_LOGIN_ERROR = '用户名或密码错误，请重试';
const PSYSEEN_LOGIN_TIMEOUT_ERROR = '登录失败，请检查网络或账号密码后重试';

function getPsyseenRoute(url) {
  if (typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'org.psyseen.com') {
      return null;
    }

    const route = parsed.hash
      ? parsed.hash.slice(1).split('?')[0]
      : parsed.pathname;

    if (route === '/dashboard' || route.startsWith('/dashboard/')) {
      return 'dashboard';
    }

    if (route === '/login' || route.startsWith('/login/')) {
      return 'login';
    }
  } catch (error) {
    return null;
  }

  return null;
}

class PsyseenLoginState {
  constructor() {
    this.submissionAttempted = false;
    this.status = 'pending';
  }

  markSubmissionAttempted() {
    this.submissionAttempted = true;
  }

  recordNavigation(url) {
    if (this.status !== 'pending') {
      return this.status;
    }

    const route = getPsyseenRoute(url);
    if (route === 'dashboard') {
      this.status = 'success';
    } else if (route === 'login' && this.submissionAttempted) {
      this.status = 'invalid-credentials';
    }

    return this.status;
  }

  isSuccessful() {
    return this.status === 'success';
  }

  isFailed() {
    return this.status === 'invalid-credentials';
  }

  getError() {
    return this.isFailed()
      ? PSYSEEN_LOGIN_ERROR
      : PSYSEEN_LOGIN_TIMEOUT_ERROR;
  }
}

module.exports = {
  PSYSEEN_LOGIN_ERROR,
  PSYSEEN_LOGIN_TIMEOUT_ERROR,
  PsyseenLoginState,
  getPsyseenRoute,
};
