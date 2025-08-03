// services.js - Services Management Module
class ServicesModule {
    constructor(firestore, auth, logger) {
        this.db = firestore;
        this.auth = auth;
        this.logger = logger;
    }

    /**
     * Create a new service (Admin only)
     * @param {Object} serviceData - Service data
     * @returns {Promise<string>} Service ID
     */
    async createService(serviceData) {
        try {
            // Validate required fields
            this.validateServiceData(serviceData);

            const docRef = await this.db.collection('services').add({
                name: serviceData.name,
                description: serviceData.description,
                category: serviceData.category,
                requiredDocuments: this.parseDocuments(serviceData.requiredDocuments),
                eligibilityCriteria: serviceData.eligibilityCriteria || [],
                processingTime: serviceData.processingTime || '7-10 days',
                fees: serviceData.fees || 0,
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.auth.currentUser?.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.logger.info('Service created successfully', { 
                serviceId: docRef.id, 
                serviceName: serviceData.name 
            });

            return docRef.id;
        } catch (error) {
            this.logger.error('Failed to create service', { error: error.message });
            throw error;
        }
    }

    /**
     * Get all active services
     * @param {string} category - Optional category filter
     * @returns {Promise<Array>} List of services
     */
    async getServices(category = null) {
        try {
            let query = this.db.collection('services').where('isActive', '==', true);
            
            if (category) {
                query = query.where('category', '==', category);
            }

            const snapshot = await query.orderBy('createdAt', 'desc').get();
            const services = [];

            snapshot.forEach(doc => {
                services.push({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate(),
                    updatedAt: doc.data().updatedAt?.toDate()
                });
            });

            this.logger.info('Services retrieved', { count: services.length, category });
            return services;
        } catch (error) {
            this.logger.error('Failed to retrieve services', { error: error.message });
            throw error;
        }
    }

    /**
     * Get service by ID
     * @param {string} serviceId - Service ID
     * @returns {Promise<Object>} Service data
     */
    async getServiceById(serviceId) {
        try {
            const doc = await this.db.collection('services').doc(serviceId).get();
            
            if (!doc.exists) {
                throw new Error('Service not found');
            }

            const serviceData = {
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate(),
                updatedAt: doc.data().updatedAt?.toDate()
            };

            return serviceData;
        } catch (error) {
            this.logger.error('Failed to get service by ID', { serviceId, error: error.message });
            throw error;
        }
    }

    /**
     * Update service (Admin only)
     * @param {string} serviceId - Service ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<void>}
     */
    async updateService(serviceId, updateData) {
        try {
            const updates = {
                ...updateData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.auth.currentUser?.uid
            };

            // Parse documents if provided
            if (updateData.requiredDocuments) {
                updates.requiredDocuments = this.parseDocuments(updateData.requiredDocuments);
            }

            await this.db.collection('services').doc(serviceId).update(updates);

            this.logger.info('Service updated successfully', { serviceId });
        } catch (error) {
            this.logger.error('Failed to update service', { serviceId, error: error.message });
            throw error;
        }
    }

    /**
     * Delete service (Admin only)
     * @param {string} serviceId - Service ID
     * @returns {Promise<void>}
     */
    async deleteService(serviceId) {
        try {
            // Soft delete - mark as inactive
            await this.db.collection('services').doc(serviceId).update({
                isActive: false,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedBy: this.auth.currentUser?.uid
            });

            this.logger.info('Service deleted successfully', { serviceId });
        } catch (error) {
            this.logger.error('Failed to delete service', { serviceId, error: error.message });
            throw error;
        }
    }

    /**
     * Search services
     * @param {string} searchTerm - Search term
     * @param {string} category - Optional category filter
     * @returns {Promise<Array>} Matching services
     */
    async searchServices(searchTerm, category = null) {
        try {
            let services = await this.getServices(category);
            
            if (!searchTerm) return services;

            const filtered = services.filter(service => 
                service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                service.description.toLowerCase().includes(searchTerm.toLowerCase())
            );

            this.logger.info('Services searched', { 
                searchTerm, 
                category, 
                resultsCount: filtered.length 
            });

            return filtered;
        } catch (error) {
            this.logger.error('Failed to search services', { error: error.message });
            throw error;
        }
    }

    /**
     * Get service categories
     * @returns {Promise<Array>} List of categories with counts
     */
    async getServiceCategories() {
        try {
            const services = await this.getServices();
            const categoryMap = new Map();

            services.forEach(service => {
                const category = service.category;
                categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
            });

            const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
                name,
                count,
                displayName: this.getCategoryDisplayName(name)
            }));

            return categories;
        } catch (error) {
            this.logger.error('Failed to get service categories', { error: error.message });
            throw error;
        }
    }

    /**
     * Get service statistics (Admin only)
     * @returns {Promise<Object>} Service statistics
     */
    async getServiceStatistics() {
        try {
            const services = await this.getServices();
            const applications = await this.db.collection('applications').get();

            const stats = {
                totalServices: services.length,
                totalApplications: applications.size,
                categoryCounts: {},
                popularServices: []
            };

            // Category counts
            services.forEach(service => {
                const category = service.category;
                stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;
            });

            // Popular services (by application count)
            const serviceApplicationCounts = new Map();
            applications.forEach(doc => {
                const app = doc.data();
                const serviceId = app.serviceId;
                serviceApplicationCounts.set(serviceId, (serviceApplicationCounts.get(serviceId) || 0) + 1);
            });

            stats.popularServices = Array.from(serviceApplicationCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([serviceId, count]) => ({
                    serviceId,
                    applicationCount: count,
                    serviceName: services.find(s => s.id === serviceId)?.name || 'Unknown'
                }));

            this.logger.info('Service statistics generated');
            return stats;
        } catch (error) {
            this.logger.error('Failed to get service statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate service data
     * @private
     * @param {Object} serviceData - Service data to validate
     * @throws {Error} If validation fails
     */
    validateServiceData(serviceData) {
        const required = ['name', 'description', 'category'];
        const missing = required.filter(field => !serviceData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        const validCategories = ['certificate', 'license', 'welfare', 'other'];
        if (!validCategories.includes(serviceData.category)) {
            throw new Error('Invalid service category');
        }
    }

    /**
     * Parse documents string to array
     * @private
     * @param {string} documentsString - Comma-separated documents
     * @returns {Array} Array of document names
     */
    parseDocuments(documentsString) {
        if (!documentsString) return [];
        return documentsString.split(',').map(doc => doc.trim()).filter(doc => doc.length > 0);
    }

    /**
     * Get display name for category
     * @private
     * @param {string} category - Category name
     * @returns {string} Display name
     */
    getCategoryDisplayName(category) {
        const displayNames = {
            'certificate': 'Certificates',
            'license': 'Licenses',
            'welfare': 'Welfare Schemes',
            'other': 'Other Services'
        };
        return displayNames[category] || category;
    }

    /**
     * Bulk import services (Admin only)
     * @param {Array} servicesData - Array of service data
     * @returns {Promise<Array>} Array of created service IDs
     */
    async bulkImportServices(servicesData) {
        try {
            const batch = this.db.batch();
            const serviceIds = [];

            servicesData.forEach(serviceData => {
                this.validateServiceData(serviceData);
                const serviceRef = this.db.collection('services').doc();
                
                batch