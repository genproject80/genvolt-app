import bcrypt from 'bcryptjs';

/**
 * Password encryption utilities using bcrypt
 */
export class PasswordEncryption {
  
  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password
   * @param {number} saltRounds - Number of salt rounds (default: 12)
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password, saltRounds = 12) {
    try {
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const salt = await bcrypt.genSalt(saltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      return hashedPassword;
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Compare a plain text password with a hashed password
   * @param {string} password - Plain text password
   * @param {string} hashedPassword - Hashed password from database
   * @returns {Promise<boolean>} True if passwords match
   */
  static async comparePassword(password, hashedPassword) {
    try {
      if (!password || !hashedPassword) {
        throw new Error('Password and hash are required');
      }

      const isValid = await bcrypt.compare(password, hashedPassword);
      return isValid;
    } catch (error) {
      throw new Error(`Password comparison failed: ${error.message}`);
    }
  }

  /**
   * Generate a random salt
   * @param {number} rounds - Number of salt rounds
   * @returns {Promise<string>} Generated salt
   */
  static async generateSalt(rounds = 12) {
    try {
      const salt = await bcrypt.genSalt(rounds);
      return salt;
    } catch (error) {
      throw new Error(`Salt generation failed: ${error.message}`);
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with strength and suggestions
   */
  static validatePasswordStrength(password) {
    const result = {
      isValid: false,
      strength: 'weak',
      score: 0,
      suggestions: []
    };

    if (!password) {
      result.suggestions.push('Password is required');
      return result;
    }

    let score = 0;
    const suggestions = [];

    // Length check
    if (password.length < 6) {
      suggestions.push('Password must be at least 6 characters long');
    } else if (password.length >= 8) {
      score += 1;
    } else {
      suggestions.push('Consider using at least 8 characters');
    }

    // Uppercase check
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Add uppercase letters');
    }

    // Lowercase check
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Add lowercase letters');
    }

    // Number check
    if (/\d/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Add numbers');
    }

    // Special character check
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Add special characters');
    }

    // Common password check
    const commonPasswords = [
      'password', 'password123', '123456', 'qwerty', 'abc123',
      'letmein', 'monkey', '1234567890', 'password1', 'admin'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      score = Math.max(0, score - 2);
      suggestions.push('Avoid common passwords');
    }

    // Determine strength
    if (score <= 2) {
      result.strength = 'weak';
    } else if (score <= 3) {
      result.strength = 'medium';
    } else {
      result.strength = 'strong';
    }

    result.score = score;
    result.suggestions = suggestions;
    result.isValid = password.length >= 6 && score >= 2;

    return result;
  }
}

export default PasswordEncryption;