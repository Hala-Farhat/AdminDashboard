import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { useEffect } from 'react';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const styles = {
        success: {
            bg: 'bg-gradient-to-r from-green-500 to-emerald-500',
            icon: CheckCircle,
            iconColor: 'text-white'
        },
        error: {
            bg: 'bg-gradient-to-r from-red-500 to-rose-500',
            icon: XCircle,
            iconColor: 'text-white'
        },
        warning: {
            bg: 'bg-gradient-to-r from-yellow-500 to-orange-500',
            icon: AlertCircle,
            iconColor: 'text-white'
        },
        info: {
            bg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
            icon: Info,
            iconColor: 'text-white'
        }
    };

    const style = styles[type] || styles.info;
    const Icon = style.icon;

    return (
        <div className={`${style.bg} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px] max-w-md animate-slide-in`}>
            <Icon className={`h-6 w-6 ${style.iconColor} flex-shrink-0`} />
            <p className="flex-1 font-medium text-sm">{message}</p>
            <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors flex-shrink-0"
            >
                <X className="h-5 w-5" />
            </button>
        </div>
    );
};

export default Toast;
