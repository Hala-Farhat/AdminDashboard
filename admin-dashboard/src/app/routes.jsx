import { Navigate, Route, Routes } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';

import Login from '../pages/Login';
import Providers from '../pages/Providers';
import ProviderDetails from '../pages/ProviderDetails';
import Categories from '../pages/Categories';
import CategoryServiceExperts from '../pages/CategoryServiceExperts';
import Locations from '../pages/Locations';
import Users from '../pages/Users';
import ClientDetails from '../pages/ClientDetails';
import ServiceOrders from '../pages/ServiceOrders';
import ServiceOrderDetails from '../pages/ServiceOrderDetails';
import DashboardHome from '../pages/DashboardHome';
import ExpertJobRequests from '../pages/ExpertJobRequests';
import JobRequestDetails from '../pages/JobRequestDetails';
import ProfileLayout from '../pages/Profile/ProfileLayout';
import GeneralSettings from '../pages/Profile/GeneralSettings';
import SecuritySettings from '../pages/Profile/SecuritySettings';
import LanguageSettings from '../pages/Profile/LanguageSettings';
import ThemeSettings from '../pages/Profile/ThemeSettings';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="submitted" element={<Providers />} />
        <Route path="under-review" element={<Providers />} />
        <Route path="approved" element={<Providers />} />
        <Route path="rejected" element={<Providers />} />
        <Route path="jobs/:id" element={<JobRequestDetails />} />
        <Route path="jobs" element={<ExpertJobRequests />} />
        <Route path="provider/:id" element={<ProviderDetails />} />
        <Route path="categories/sub/:subCategoryId/services/:serviceId/experts" element={<CategoryServiceExperts />} />
        <Route path="categories" element={<Categories />} />
        <Route path="locations" element={<Locations />} />
        <Route path="users" element={<Users />} />
        <Route path="client/:id" element={<ClientDetails />} />
        <Route path="service-orders" element={<ServiceOrders />} />
        <Route path="service-orders/:orderId" element={<ServiceOrderDetails />} />
        <Route path="profile" element={<ProfileLayout />}>
          <Route index element={<Navigate to="security" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="security" element={<SecuritySettings />} />
          <Route path="language" element={<LanguageSettings />} />
          <Route path="appearance" element={<ThemeSettings />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

