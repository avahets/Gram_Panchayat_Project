// applications.js - Applications Management Module
class ApplicationsModule {
    constructor(firestore, auth, logger) {
        this.db = firestore;
        this.auth = auth;
        this.logger = logger;
    }

    /**
     * Submit a new application
     * @param {Object} applicationData - Application data
     * @returns {Promise<string>} Application ID
     */
    async submitApplication(applicationData) {
        try {
            this.validateApplicationData(applicationData);

            // Get service details
            const serviceDoc = await this.db.collection('services').doc(applicationData.serviceId).get();
            if (!serviceDoc.exists) {
                throw new Error('Service not found');
            }

            const service = serviceDoc.data();
            const applicationId = this.generateApplicationId();

            const docRef = await this.db.collection('applications').add({
                applicationId,
                serviceId: applicationData.serviceId,
                serviceName: service.name,
                userId: this.auth.currentUser.uid,
                applicantDetails: {
                    name: applicationData.applicantName,
                    email: applicationData.applicantEmail,
                    phone: applicationData.applicantPhone,
                    address: applicationData.applicantAddress
                },
                applicationData: applicationData.formData || {},
                documents: applicationData.documents || [],
                status: 'pending',
                priority: applicationData.priority || 'normal',
                appliedAt: firebase.firestore.FieldValue.serverTimestamp(),
                estimatedCompletionDate: this.calculateEstimatedDate(service.processingTime),
                statusHistory: [{
                    status: 'pending',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: this.auth.currentUser.uid,
                    comments: 'Application submitted'
                }]
            });

            this.logger.info('Application submitted successfully', {
                applicationId,
                serviceId: applicationData.serviceId,
                userId: this.auth.currentUser.uid
            });

            return docRef.id;
        } catch (error) {
            this.logger.error('Failed to submit application', { error: error.message });
            throw error;
        }
    }

    /**
     * Get applications for current user
     * @param {string} status - Optional status filter
     * @returns {Promise<Array>} User applications
     */
    async getUserApplications(status = null) {
        try {
            if (!this.auth.currentUser) {
                throw new Error('User not authenticated');
            }

            let query = this.db.collection('applications')
                .where('userId', '==', this.auth.currentUser.uid);

            if (status) {
                query = query.where('status', '==', status);
            }

            const snapshot = await query.orderBy('appliedAt', 'desc').get();
            const applications = [];

            snapshot.forEach(doc => {
                applications.push({
                    id: doc.id,
                    ...doc.data(),
                    appliedAt: doc.data().appliedAt?.toDate(),
                    updatedAt: doc.data().updatedAt?.toDate(),
                    estimatedCompletionDate: doc.data().estimatedCompletionDate?.toDate()
                });
            });

            return applications;
        } catch (error) {
            this.logger.error('Failed to get user applications', { error: error.message });
            throw error;
        }
    }

    /**
     * Get all applications (Staff/Admin only)
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} All applications
     */
    async getAllApplications(filters = {}) {
        try {
            let query = this.db.collection('applications');

            // Apply filters
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            if (filters.serviceId) {
                query = query.where('serviceId', '==', filters.serviceId);
            }
            if (filters.priority) {
                query = query.where('priority', '==', filters.priority);
            }

            const snapshot = await query.orderBy('appliedAt', 'desc').get();
            const applications = [];

            snapshot.forEach(doc => {
                applications.push({
                    id: doc.id,
                    ...doc.data(),
                    appliedAt: doc.data().appliedAt?.toDate(),
                    updatedAt: doc.data().updatedAt?.toDate(),
                    estimatedCompletionDate: doc.data().estimatedCompletionDate?.toDate()
                });
            });

            return applications;
        } catch (error) {
            this.logger.error('Failed to get all applications', { error: error.message });
            throw error;
        }
    }

    /**
     * Get pending applications (Staff/Admin only)
     * @returns {Promise<Array>} Pending applications
     */
    async getPendingApplications() {
        return this.getAllApplications({ status: 'pending' });
    }

    /**
     * Update application status
     * @param {string} applicationId - Application ID
     * @param {string} newStatus - New status
     * @param {string} comments - Optional comments
     * @returns {Promise<void>}
     */
    async updateApplicationStatus(applicationId, newStatus, comments = '') {
        try {
            const validStatuses = ['pending', 'under_review', 'approved', 'rejected', 'completed'];
            if (!validStatuses.includes(newStatus)) {
                throw new Error('Invalid status');
            }

            const applicationRef = this.db.collection('applications').doc(applicationId);
            const applicationDoc = await applicationRef.get();

            if (!applicationDoc.exists) {
                throw new Error('Application not found');
            }

            const currentData = applicationDoc.data();
            const statusHistory = currentData.statusHistory || [];

            // Add new status to history
            statusHistory.push({
                status: newStatus,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.auth.currentUser.uid,
                comments: comments || `Status changed to ${newStatus}`
            });

            const updateData = {
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: this.auth.currentUser.uid,
                statusHistory
            };

            // Set completion date if approved or completed
            if (newStatus === 'approved' || newStatus === 'completed') {
                updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
            }

            await applicationRef.update(updateData);

            this.logger.info('Application status updated', {
                applicationId,
                oldStatus: currentData.status,
                newStatus,
                updatedBy: this.auth.currentUser.uid
            });

            // Send notification (in a real app, this would trigger email/SMS)
            await this.createNotification(currentData.userId, {
                type: 'status_update',
                title: 'Application Status Updated',
                message: `Your application for ${currentData.serviceName} has been ${newStatus}`,
                applicationId,
                data: { newStatus, comments }
            });

        } catch (error) {
            this.logger.error('Failed to update application status', { 
                applicationId, 
                newStatus, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Get application by ID
     * @param {string} applicationId - Application ID
     * @returns {Promise<Object>} Application data
     */
    async getApplicationById(applicationId) {
        try {
            const doc = await this.db.collection('applications').doc(applicationId).get();
            
            if (!doc.exists) {
                throw new Error('Application not found');
            }

            const applicationData = {
                id: doc.id,
                ...doc.data(),
                appliedAt: doc.data().appliedAt?.toDate(),
                updatedAt: doc.data().updatedAt?.toDate(),
                completedAt: doc.data().completedAt?.toDate(),
                estimatedCompletionDate: doc.data().estimatedCompletionDate?.toDate()
            };

            return applicationData;
        } catch (error) {
            this.logger.error('Failed to get application by ID', { applicationId, error: error.message });
            throw error;
        }
    }

    /**
     * Cancel application (User only, if status is pending)
     * @param {string} applicationId - Application ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise<void>}
     */
    async cancelApplication(applicationId, reason = '') {
        try {
            const applicationDoc = await this.db.collection('applications').doc(applicationId).get();
            
            if (!applicationDoc.exists) {
                throw new Error('Application not found');
            }

            const applicationData = applicationDoc.data();

            // Check if user owns the application
            if (applicationData.userId !== this.auth.currentUser.uid) {
                throw new Error('Unauthorized to cancel this application');
            }

            // Check if application can be cancelled
            if (applicationData.status !== 'pending') {
                throw new Error('Application cannot be cancelled at this stage');
            }

            await this.updateApplicationStatus(applicationId, 'cancelled', reason || 'Cancelled by user');

            this.logger.info('Application cancelled by user', {
                applicationId,
                userId: this.auth.currentUser.uid,
                reason
            });

        } catch (error) {
            this.logger.error('Failed to cancel application', { applicationId, error: error.message });
            throw error;
        }
    }

    /**
     * Get application statistics
     * @param {Object} filters - Filter options
     * @returns {Promise<Object>} Application statistics
     */
    async getApplicationStatistics(filters = {}) {
        try {
            const applications = await this.getAllApplications(filters);

            const stats = {
                total: applications.length,
                byStatus: {},
                byService: {},
                byMonth: {},
                averageProcessingTime: 0,
                priorityDistribution: {}
            };

            const now = new Date();
            const processingTimes = [];

            applications.forEach(app => {
                // Status distribution
                stats.byStatus[app.status] = (stats.byStatus[app.status] || 0) + 1;

                // Service distribution
                const serviceName = app.serviceName || 'Unknown';
                stats.byService[serviceName] = (stats.byService[serviceName] || 0) + 1;

                // Monthly distribution
                const monthKey = app.appliedAt.toISOString().substring(0, 7); // YYYY-MM
                stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;

                // Priority distribution
                const priority = app.priority || 'normal';
                stats.priorityDistribution[priority] = (stats.priorityDistribution[priority] || 0) + 1;

                // Processing time calculation
                if (app.completedAt && app.appliedAt) {
                    const processingTime = (app.completedAt - app.appliedAt) / (1000 * 60 * 60 * 24); // days
                    processingTimes.push(processingTime);
                }
            });

            // Calculate average processing time
            if (processingTimes.length > 0) {
                stats.averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
            }

            return stats;
        } catch (error) {
            this.logger.error('Failed to get application statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Search applications
     * @param {string} searchTerm - Search term
     * @param {Object} filters - Additional filters
     * @returns {Promise<Array>} Matching applications
     */
    async searchApplications(searchTerm, filters = {}) {
        try {
            let applications = await this.getAllApplications(filters);

            if (!searchTerm) return applications;

            const filtered = applications.filter(app => 
                app.applicationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.serviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.applicantDetails.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.applicantDetails.email.toLowerCase().includes(searchTerm.toLowerCase())
            );

            this.logger.info('Applications searched', { 
                searchTerm, 
                filters, 
                resultsCount: filtered.length 
            });

            return filtered;
        } catch (error) {
            this.logger.error('Failed to search applications', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate unique application ID
     * @private
     * @returns {string} Application ID
     */
    generateApplicationId() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const timestamp = Date.now().toString().slice(-6);
        
        return `APP${year}${month}${day}${timestamp}`;
    }

    /**
     * Calculate estimated completion date
     * @private
     * @param {string} processingTime - Processing time string
     * @returns {Date} Estimated completion date
     */
    calculateEstimatedDate(processingTime) {
        const days = this.parseProcessingTime(processingTime);
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date;
    }

    /**
     * Parse processing time string to days
     * @private
     * @param {string} processingTime - Processing time string
     * @returns {number} Number of days
     */
    parseProcessingTime(processingTime) {
        if (!processingTime) return 7;
        
        const match = processingTime.match(/(\d+)/);
        return match ? parseInt(match[1]) : 7;
    }

    /**
     * Validate application data
     * @private
     * @param {Object} applicationData - Application data
     * @throws {Error} If validation fails
     */
    validateApplicationData(applicationData) {
        const required = ['serviceId', 'applicantName', 'applicantEmail', 'applicantPhone'];
        const missing = required.filter(field => !applicationData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(applicationData.applicantEmail)) {
            throw new Error('Invalid email format');
        }

        // Validate phone format (basic)
        const phoneRegex = /^\d{10,15}$/;
        if (!phoneRegex.test(applicationData.applicantPhone.replace(/\D/g, ''))) {
            throw new Error('Invalid phone number format');
        }
    }

    /**
     * Create notification for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} notificationData - Notification data
     * @returns {Promise<void>}
     */
    async createNotification(userId, notificationData) {
        try {
            await this.db.collection('notifications').add({
                userId,
                ...notificationData,
                isRead: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            this.logger.error('Failed to create notification', { userId, error: error.message });
        }
    }

    /**
     * Bulk update application status
     * @param {Array} applicationIds - Array of application IDs
     * @param {string} newStatus - New status
     * @param {string} comments - Comments
     * @returns {Promise<Object>} Update results
     */
    async bulkUpdateStatus(applicationIds, newStatus, comments = '') {
        try {
            const batch = this.db.batch();
            const results = { success: 0, failed: 0, errors: [] };

            for (const applicationId of applicationIds) {
                try {
                    const applicationRef = this.db.collection('applications').doc(applicationId);
                    const applicationDoc = await applicationRef.get();

                    if (applicationDoc.exists) {
                        const currentData = applicationDoc.data();
                        const statusHistory = currentData.statusHistory || [];

                        statusHistory.push({
                            status: newStatus,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedBy: this.auth.currentUser.uid,
                            comments: comments || `Bulk update to ${newStatus}`
                        });

                        batch.update(applicationRef, {
                            status: newStatus,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            lastUpdatedBy: this.auth.currentUser.uid,
                            statusHistory
                        });

                        results.success++;
                    } else {
                        results.failed++;
                        results.errors.push(`Application ${applicationId} not found`);
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push(`Failed to update ${applicationId}: ${error.message}`);
                }
            }

            await batch.commit();

            this.logger.info('Bulk status update completed', {
                totalProcessed: applicationIds.length,
                successful: results.success,
                failed: results.failed
            });

            return results;
        } catch (error) {
            this.logger.error('Failed to bulk update application status', { error: error.message });
            throw error;
        }
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApplicationsModule;
}