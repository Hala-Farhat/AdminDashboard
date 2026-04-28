import { createContext, useContext, useState, useEffect } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onIdTokenChanged,
    getIdToken,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signInWithPopup,
    sendEmailVerification,
    getAdditionalUserInfo,
    deleteUser
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { unregisterWebFcmOnServer } from '../adminWebPush';
import api from '../api/apiConfig';

const AuthContext = createContext(null);

/**
 * إزالة مستخدم Firebase أنشأه OAuth (مثلاً Google) ثم تبين أنه غير مسجّل في الباكند — لا نُبقي حساباً يتيماً.
 * إن فشل الحذف (مثلاً يحتاج إعادة مصادقة حديثة) نكتفي بـ signOut.
 */
async function removeOrphanFirebaseUser(firebaseUser) {
    if (!firebaseUser) return;
    try {
        await deleteUser(firebaseUser);
    } catch (e) {
        console.warn('[auth] deleteUser:', e?.code || e?.message);
        try {
            await signOut(auth);
        } catch {
            /* ignore */
        }
    }
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    /** ثابت لكل جلسة Firebase — لا يتغيّر عند تجديد الـ JWT (على عكس `token`) */
    const [authUid, setAuthUid] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const idToken = await getIdToken(firebaseUser);

                try {
                    const response = await api.get(`/users/me/profile`, {
                        headers: { Authorization: `Bearer ${idToken}` }
                    });

                    if (response.data) {
                        console.log("DEBUG: Auth State Profile Response:", response.data);
                        let userData = response.data.data?.personalInfo || response.data.data?.data || response.data.data || response.data;
                        if (Array.isArray(userData)) userData = userData[0];
                        if (userData?.user && !userData.role) userData = userData.user;
                        if (userData?.personalInfo && !userData.role) userData = userData.personalInfo;

                        const role = (userData?.role || userData?.user?.role || userData?.personalInfo?.role || '').toString().toLowerCase().trim();
                        console.log("DEBUG: Normalized Role:", role);

                        if (role !== 'admin') {
                            console.warn(`DEBUG: Access Denied! Role '${role}' is not 'admin'`);
                            await signOut(auth);
                            setUser(null);
                            setToken(null);
                            setAuthUid(null);
                        } else {
                            console.log("DEBUG: Access Granted! Setting user data.");
                            setUser(userData);
                            setToken(idToken);
                            setAuthUid(firebaseUser.uid);
                        }
                    } else {
                        console.error("DEBUG: No response data from profile fetch");
                        await signOut(auth);
                        setUser(null);
                        setToken(null);
                        setAuthUid(null);
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    const status = error.response?.status;
                    if (status === 404 && firebaseUser) {
                        await removeOrphanFirebaseUser(firebaseUser);
                    } else {
                        await signOut(auth);
                    }
                    setUser(null);
                    setToken(null);
                    setAuthUid(null);
                }
            } else {
                setUser(null);
                setToken(null);
                setAuthUid(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const loginWithGoogle = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const firebaseUser = result.user;
            const isNewUser = getAdditionalUserInfo(result)?.isNewUser;

            console.log("DEBUG: Google Login User:", firebaseUser.email, "IsNew:", isNewUser);

            if (!firebaseUser.emailVerified) {
                await sendEmailVerification(firebaseUser);
                await signOut(auth);
                return { success: false, errorKey: 'login.errors.emailNotVerified' };
            }

            const idToken = await getIdToken(firebaseUser);

            try {
                const response = await api.get(`/users/me/profile`, {
                    headers: { Authorization: `Bearer ${idToken}` }
                });

                console.log("DEBUG: Google Login Profile Response:", response.data);
                let userData = response.data.data?.personalInfo || response.data.data?.data || response.data.data || response.data;
                if (Array.isArray(userData)) userData = userData[0];
                if (userData?.user && !userData.role) userData = userData.user;
                if (userData?.personalInfo && !userData.role) userData = userData.personalInfo;

                const role = (userData?.role || userData?.user?.role || userData?.personalInfo?.role || '').toString().toLowerCase().trim();
                console.log("DEBUG: Google Login Role Extracted:", role);

                if (role !== 'admin') {
                    console.warn(`DEBUG: Google Login - Role '${role}' is not 'admin'`);
                    await signOut(auth);
                    setUser(null);
                    setToken(null);
                    setAuthUid(null);
                    return { success: false, errorKey: 'login.errors.accessDenied' };
                }

                setUser(userData);
                setToken(idToken);
                setAuthUid(firebaseUser.uid);
                return { success: true };
            } catch (backendError) {
                console.error("Backend validation error:", backendError);
                const status = backendError.response?.status;

                if (status === 404) {
                    await removeOrphanFirebaseUser(firebaseUser);
                    return { success: false, errorKey: 'login.errors.accountNotRegistered' };
                }

                await signOut(auth);
                setUser(null);
                setToken(null);
                setAuthUid(null);
                if (status === 403) {
                    return { success: false, errorKey: 'login.errors.accessDenied' };
                }
                if (!backendError.response) {
                    return { success: false, errorKey: 'login.errors.networkError' };
                }
                return { success: false, errorKey: 'login.errors.profileUnavailable' };
            }

        } catch (error) {
            console.error("Google login error:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                return { success: false, isCancelled: true };
            }
            if (error.code === 'auth/user-not-found') {
                return { success: false, errorKey: 'login.errors.userNotFound' };
            }
            return { success: false, errorKey: 'login.errors.loginFailed' };
        }
    };

    /** POST /auth/emails/reset-password — الـ `lang` يُضاف تلقائياً من apiConfig */
    const resetPassword = async (email) => {
        const trimmed = typeof email === 'string' ? email.trim() : '';
        if (!trimmed) {
            return { success: false, errorKey: 'common.error' };
        }
        try {
            await api.post('/auth/emails/reset-password', { email: trimmed }, {
                headers: { 'Content-Type': 'application/json' },
            });
            return { success: true };
        } catch (error) {
            console.error('Reset password error:', error);
            const status = error.response?.status;
            let errorKey = 'common.error';
            if (status === 404) {
                errorKey = 'login.errors.userNotFound';
            } else if (status === 429) {
                errorKey = 'login.errors.tooManyAttempts';
            } else if (!error.response) {
                errorKey = 'login.errors.networkError';
            }
            return { success: false, errorKey };
        }
    };

    const login = async (email, password) => {
        let firebaseUser = null;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            firebaseUser = userCredential.user;

            if (!firebaseUser.emailVerified) {
                await sendEmailVerification(firebaseUser);
                await signOut(auth);
                return { success: false, errorKey: 'login.errors.emailNotVerified' };
            }

            const idToken = await getIdToken(firebaseUser);

            try {
                const response = await api.get(`/users/me/profile`, {
                    headers: { Authorization: `Bearer ${idToken}` }
                });

                if (response.data) {
                    console.log("DEBUG: Email Login Profile Response:", response.data);
                    let userData = response.data.data?.personalInfo || response.data.data?.data || response.data.data || response.data;
                    if (Array.isArray(userData)) userData = userData[0];
                    if (userData?.user && !userData.role) userData = userData.user;
                    if (userData?.personalInfo && !userData.role) userData = userData.personalInfo;

                    const role = (userData?.role || userData?.user?.role || userData?.personalInfo?.role || '').toString().toLowerCase().trim();
                    console.log("DEBUG: Email Login Role Extracted:", role);

                    if (role !== 'admin') {
                        console.warn("DEBUG: Email Login - Not an admin:", role);
                        await signOut(auth);
                        setUser(null);
                        setToken(null);
                        setAuthUid(null);
                        return {
                            success: false,
                            errorKey: 'login.errors.accessDenied'
                        };
                    }

                    setUser(userData);
                    setToken(idToken);
                    setAuthUid(firebaseUser.uid);
                    return { success: true };
                }

                console.error("DEBUG: Email Login - Invalid response structure");
                await signOut(auth);
                return { success: false, errorKey: 'login.errors.accessDenied' };
            } catch (profileError) {
                const status = profileError.response?.status;
                console.error("Email login profile error:", profileError);

                if (status === 404) {
                    await removeOrphanFirebaseUser(firebaseUser);
                    setUser(null);
                    setToken(null);
                    setAuthUid(null);
                    return { success: false, errorKey: 'login.errors.accountNotRegistered' };
                }

                await signOut(auth);
                setUser(null);
                setToken(null);
                setAuthUid(null);

                if (status === 403) {
                    return { success: false, errorKey: 'login.errors.accessDenied' };
                }
                if (!profileError.response) {
                    return { success: false, errorKey: 'login.errors.networkError' };
                }
                return { success: false, errorKey: 'login.errors.profileUnavailable' };
            }
        } catch (error) {
            console.error("Firebase login error:", error);

            let errorKey = 'login.errors.loginFailed';
            if (
                error.code === 'auth/user-not-found' ||
                error.code === 'auth/wrong-password' ||
                error.code === 'auth/invalid-credential'
            ) {
                errorKey = 'login.errors.invalidCredentials';
            } else if (error.code === 'auth/too-many-requests') {
                errorKey = 'login.errors.tooManyAttempts';
            } else if (error.code === 'auth/network-request-failed') {
                errorKey = 'login.errors.networkError';
            }

            return { success: false, errorKey };
        }
    };

    const refreshProfile = async () => {
        if (!auth.currentUser) return;
        try {
            const idToken = await getIdToken(auth.currentUser);
            const response = await api.get(`/users/me/profile`, {
                headers: { Authorization: `Bearer ${idToken}` }
            });
            if (response.data) {
                let userData = response.data.data?.personalInfo || response.data.data?.data || response.data.data || response.data;
                if (Array.isArray(userData)) userData = userData[0];
                if (userData?.personalInfo) userData = userData.personalInfo;
                if (userData?.user) userData = userData.user;
                setUser(userData);
            }
        } catch (error) {
            console.error("Error refreshing profile:", error);
        }
    };

    const logout = async () => {
        await unregisterWebFcmOnServer(token);
        await signOut(auth);
    };

    const changePassword = async (currentPassword, newPassword) => {
        if (!auth.currentUser) return { success: false, error: 'User not authenticated' };

        try {
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPassword);
            return { success: true };
        } catch (error) {
            console.error("Change password error:", error);
            return { success: false, error: error.code };
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, authUid, login, loginWithGoogle, resetPassword, logout, refreshProfile, changePassword, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};


export const useAuth = () => useContext(AuthContext);
