import { SECURITY_CONFIG, MASTER_TEACHER } from '../constants';

export const AuthService = {
  /**
   * Validates teacher password.
   * Currently uses local check, but can be updated to use a backend endpoint.
   */
  async login(password, customAdminCode) {
    // For now, we still support the legacy hardcoded password check
    // but abstracted into this service.
    const expected = String(customAdminCode || SECURITY_CONFIG.ADMIN_CODE || MASTER_TEACHER.password);
    
    // Artificial delay to simulate network/processing and prevent brute force
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (String(password) === expected) {
      return { success: true, teacher: MASTER_TEACHER };
    }
    
    return { success: false, error: 'Неверный код доступа' };
  },

  /**
   * Checks if teacher operations should be restricted.
   */
  isRestricted() {
    return !!SECURITY_CONFIG.disabled;
  }
};
