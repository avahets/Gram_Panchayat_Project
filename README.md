Deployment Guide - Digital E-Gram Panchayat
 This guide provides step-by-step instructions for deploying the Digital E-Gram Panchayat
 application on various platforms.
 📋
 Prerequisites
 Before deploying, ensure you have:
 ✅
 Firebase account with active project
 ✅
 Node.js (v14 or higher) installed
 ✅
 Git installed
 ✅
 Domain name (optional, for custom domain)
 ✅
 SSL certificate (handled automatically by most platforms)
 🔧
 Pre-Deployment Setup
 1. Firebase Configuration
 Step 1: Create Firebase Project
 1. Go to 
Firebase Console
 2. Click "Create Project"
 3. Enter project name: 
digital-gram-panchayat
 4. Enable Google Analytics (optional)
 5. Select Analytics account or create new one
 Step 2: Enable Authentication
1. In Firebase Console, go to "Authentication"
 2. Click "Get Started"
 3. Go to "Sign-in method" tab
 4. Enable "Email/Password" provider
 5. Disable "Email link (passwordless sign-in)" if not needed
 Step 3: Create Firestore Database
 1. Go to "Firestore Database"
 2. Click "Create database"
 3. Select "Start in test mode" (for development)
 4. Choose location closest to your users
 5. Click "Done"
