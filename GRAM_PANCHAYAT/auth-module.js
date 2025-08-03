// auth.js - Authentication Module
class AuthModule {
    constructor(firebaseAuth, firestore, logger) {
        this.auth = firebaseAuth;
        this.db = firestore;
        this.logger = logger;
        this.currentUser = null;
        this.currentUserRole = null;
    }

    /**
     * Register a new user
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} User credential
     */
    async register(userData) {
        try {
            this.logger.info('Registration attempt started', { email: userData.email });
            
            const userCredential = await this.auth.createUserWithEmailAndPassword(
                userData.email, 
                userData.password
            );
            const user = userCredential.user;

            // Store user profile in Firestore
            await this.db.collection('users').doc(user.uid).set({
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
                address: userData.address,
                role: userData.role || 'citizen',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                isActive: true
            });

            this.logger.info('Registration successful', { userId: user.uid });
            return { success: true, user };
        } catch (error) {
            this.logger.error('Registration failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {string} role - Expected user role
     * @returns {Promise<Object>} Login result
     */
    async login(email, password, role) {
        try {
            this.logger.info('Login attempt started', { email, role });
            
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Verify user role
            const userDoc = await this.db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                throw new Error('User profile not found');
            }

            const userData = userDoc.data();
            
            if (userData.role !== role) {
                await this.auth.signOut();
                throw new Error('Invalid role selected');
            }

            if (!userData.isActive) {
                await this.auth.signOut();
                throw new Error('Account is deactivated');
            }

            this.currentUser = user;
            this.currentUserRole = role;
            
            // Update last login
            await this.db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.logger.info('Login successful', { userId: user.uid, role });
            return { success: true, user, role };
        } catch (error) {
            this.logger.error('Login failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Logout user
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            if (this.currentUser) {
                this.logger.info('User logout', { userId: this.currentUser.uid });
            }
            
            await this.auth.signOut();
            this.currentUser = null;
            this.currentUserRole = null;
            
            this.logger.info('Logout successful');
        } catch (error) {
            this.logger.error('Logout failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Get current user profile
     * @returns {Promise<Object>} User profile
     */
    async getCurrentUserProfile() {
        if (!this.currentUser) {
            throw new Error('No user logged in');
        }

        try {
            const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                return userDoc.data();
            } else {
                throw new Error('User profile not found');
            }
        } catch (error) {
            this.logger.error('Failed to get user profile', { error: error.message });
            throw error;
        }
    }

    /**
     * Update user profile
     * @param {Object} updateData - Data to update
     * @returns {Promise<void>}
     */
    async updateProfile(updateData) {
        if (!this.currentUser) {
            throw new Error('No user logged in');
        }

        try {
            await this.db.collection('users').doc(this.currentUser.uid).update({
                ...updateData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.logger.info('Profile updated successfully', { userId: this.currentUser.uid });
        } catch (error) {
            this.logger.error('Failed to update profile', { error: error.message });
            throw error;
        }
    }

    /**
     * Reset password
     * @param {string} email - User email
     * @returns {Promise<void>}
     */
    async resetPassword(email) {
        try {
            await this.auth.sendPasswordResetEmail(email);
            this.logger.info('Password reset email sent', { email });
        } catch (error) {
            this.logger.error('Failed to send password reset email', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has required role
     * @param {string|Array} requiredRole - Required role(s)
     * @returns {boolean}
     */
    hasRole(requiredRole) {
        if (!this.currentUserRole) return false;
        
        if (Array.isArray(requiredRole)) {
            return requiredRole.includes(this.currentUserRole);
        }
        
        return this.currentUserRole === requiredRole;
    }

    /**
     * Deactivate user account (Admin only)
     * @param {string} userId - User ID to deactivate
     * @returns {Promise<void>}
     */
    async deactivateUser(userId) {
        if (!this.hasRole('admin')) {
            throw new Error('Insufficient permissions');
        }

        try {
            await this.db.collection('users').doc(userId).update({
                isActive: false,
                deactivatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deactivatedBy: this.currentUser.uid
            });

            this.logger.info('User account deactivated', { userId, deactivatedBy: this.currentUser.uid });
        } catch (error) {
            this.logger.error('Failed to deactivate user', { error: error.message });
            throw error;
        }
    }

    /**
     * Get all users (Admin only)
     * @returns {Promise<Array>} List of users
     */
    async getAllUsers() {
        if (!this.hasRole('admin')) {
            throw new Error('Insufficient permissions');
        }

        try {
            const snapshot = await this.db.collection('users').orderBy('createdAt', 'desc').get();
            const users = [];
            
            snapshot.forEach(doc => {
                users.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return users;
        } catch (error) {
            this.logger.error('Failed to get all users', { error: error.message });
            throw error;
        }
    }

    /**
     * Listen for auth state changes
     * @param {Function} callback - Callback function
     */
    onAuthStateChanged(callback) {
        return this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userDoc = await this.db.collection('users').doc(user.uid).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        this.currentUser = user;
                        this.currentUserRole = userData.role;
                        callback({ user, userData });
                    }
                } catch (error) {
                    this.logger.error('Error in auth state change', { error: error.message });
                    callback(null);
                }
            } else {
                this.currentUser = null;
                this.currentUserRole = null;
                callback(null);
            }
        });
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthModule;
}