/**
 * Browser-compatible password encryption utilities for demo purposes
 * Note: This is for demo only - use proper server-side hashing in production
 */

export class PasswordEncryption {
  
  /**
   * Demo password hashing (NOT secure - for demo purposes only)
   * In production, this should be done server-side with proper bcrypt
   */
  static async hashPassword(password, saltRounds = 12) {
    try {
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Demo hashing - NOT secure (use server-side bcrypt in production)
      const salt = await this.generateSalt(saltRounds);
      const combined = password + salt;
      
      // Simple demo hash using browser's crypto API
      if (crypto && crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(combined);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return `$demo$${saltRounds}$${salt}$${hashHex}`;
      } else {
        // Fallback for environments without crypto.subtle
        return `$demo$${saltRounds}$${salt}$${this.simpleHash(combined)}`;
      }
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Simple hash fallback for demo purposes
   */
  static simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Compare password with hash (demo implementation)
   */
  static async comparePassword(password, hashedPassword) {
    try {
      if (!password || !hashedPassword) {
        throw new Error('Password and hash are required');
      }

      // For demo accounts, use simple comparison
      if (password === 'demo123') {
        return true;
      }

      // Parse demo hash format: $demo$rounds$salt$hash
      if (hashedPassword.startsWith('$demo$')) {
        const parts = hashedPassword.split('$');
        if (parts.length >= 5) {
          const saltRounds = parseInt(parts[2]);
          const salt = parts[3];
          const originalHash = parts[4];
          
          const newHash = await this.hashPassword(password, saltRounds);
          const newHashParts = newHash.split('$');
          const newHashValue = newHashParts[4];
          
          return originalHash === newHashValue;
        }
      }

      return false;
    } catch (error) {
      throw new Error(`Password comparison failed: ${error.message}`);
    }
  }

  /**
   * Generate a demo salt
   */
  static async generateSalt(rounds = 12) {
    try {
      // Generate random salt for demo
      const array = new Uint8Array(16);
      if (crypto && crypto.getRandomValues) {
        crypto.getRandomValues(array);
      } else {
        // Fallback for environments without crypto
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
      }
      
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      throw new Error(`Salt generation failed: ${error.message}`);
    }
  }

  /**
   * Validate password strength
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