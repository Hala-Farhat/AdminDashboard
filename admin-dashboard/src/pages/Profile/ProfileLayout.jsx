import { Outlet } from 'react-router-dom';

const ProfileLayout = () => (
    <div className="mx-auto w-full max-w-6xl">
        <Outlet />
    </div>
);

export default ProfileLayout;
