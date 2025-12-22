import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import './styles/App.css';

// Import pages
import AdminDashboard from './pages/AdminDashboard';
import RegistrationPage from './pages/RegistrationPage';
import AdminUserManagementPage from './pages/AdminUserManagementPage';
import ChangePasswordPage from './pages/ChangePasswordPage';

export default function App() {

  return (
    <Router>
        <Helmet>
          {/* RandomBG script */}
          <script src="/scripts/RandomBG.js" async />

          {/* Analytics and Cookie Stuff */}
          { !window.isBanter && (
            <script
              id="cookiechimpscript"
              src="https://cookiechimp.com/widget/mV3trJ.js"
            />
          )}
        </Helmet>

        <div>
            <main className="app-container">
                 <Routes>
                    {/* Public registration route */}
                    <Route path="/code/:eventID/:userID/:username" element={<RegistrationPage />} />

                    {/* Admin Routes */}
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/manage-users" element={<AdminUserManagementPage />} />
                    <Route path="/admin/change-password" element={<ChangePasswordPage />} />
                    
                    {/* Welcome/Home page */}
                    <Route path="/" element={
                        <p className="welcome-message">
                            Welcome! Navigate to the <Link to="/admin">Admin Dashboard</Link> to get started.
                        </p>
                    } />
                 </Routes>
            </main>
        </div>
    </Router>
  );
}
