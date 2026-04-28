import clsx from 'clsx';
import { ArrowDown, Check, Hand, Loader2 } from 'lucide-react';
import MapSelector from './MapSelector';

/**
 * Figma 245:5446 (draw) & 261:5906 (edit polygon) — منطقة تغطية modal.
 * LTR: form left, map right. RTL: mirrored via row dir. Map column stays dir=ltr for Leaflet.
 */
const CoverageZoneModal = ({
    open,
    title,
    formData,
    onChange,
    onSubmit,
    onClose,
    actionLoading,
    language,
    t,
    submitLabel,
}) => {
    if (!open) return null;

    const isRTL = language === 'ar';
    const hasBoundary = Boolean(formData.boundary && String(formData.boundary).trim());

    const footerHint = (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="flex items-center gap-1 text-end text-sm font-medium leading-normal text-[#666] dark:text-dark-text-secondary">
            {hasBoundary ? (
                <Hand className="h-[18px] w-[18px] shrink-0 text-khabeer-brand" aria-hidden />
            ) : null}
            <span className="min-w-0 whitespace-normal">
                {hasBoundary ? t('locations.mapHintEdit') : t('locations.mapHintDraw')}
            </span>
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-[350] flex items-center justify-center bg-black/[0.66] p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coverage-zone-modal-title"
        >
            <div
                className="flex max-h-[calc(100vh-32px)] w-full max-w-[1156px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl dark:bg-dark-bg-secondary"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                <div className="flex min-h-0 flex-col gap-6 lg:flex-row lg:items-stretch">
                    {/* Form first: start side in LTR = left, in RTL = right */}
                    <div
                        className="flex w-full min-w-0 flex-1 flex-col justify-between gap-10 lg:max-w-[380px]"
                        dir={isRTL ? 'rtl' : 'ltr'}
                    >
                        <div className="flex flex-col gap-6">
                            <h2
                                id="coverage-zone-modal-title"
                                className="text-end text-lg font-bold text-[#333] dark:text-dark-text-primary ltr:text-start"
                            >
                                {title}
                            </h2>

                            <div className="flex flex-col gap-4">
                                <label className="flex flex-col gap-2">
                                    <span className="text-end text-base text-[#333] dark:text-dark-text-primary ltr:text-start">
                                        {t('locations.fieldNameAr')}
                                    </span>
                                    <input
                                        type="text"
                                        value={formData.nameAr}
                                        onChange={(e) => onChange({ ...formData, nameAr: e.target.value })}
                                        className="h-12 w-full rounded-xl border border-khabeer-stroke bg-white px-4 py-2 text-sm text-[#333] focus:outline-none focus:ring-2 focus:ring-khabeer-brand/25 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary rtl:text-end ltr:text-start"
                                        dir="rtl"
                                        required
                                    />
                                </label>

                                <label className="flex flex-col gap-2">
                                    <span className="text-end text-base text-[#333] dark:text-dark-text-primary ltr:text-start">
                                        {t('locations.fieldNameEn')}
                                    </span>
                                    <input
                                        type="text"
                                        value={formData.nameEn}
                                        onChange={(e) => onChange({ ...formData, nameEn: e.target.value })}
                                        className="h-12 w-full rounded-xl border border-khabeer-stroke bg-white px-4 py-2 text-sm text-[#333] focus:outline-none focus:ring-2 focus:ring-khabeer-brand/25 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary ltr:text-left"
                                        dir="ltr"
                                        required
                                    />
                                </label>

                                <label className="flex flex-col gap-2">
                                    <span className="text-end text-base text-[#333] dark:text-dark-text-primary ltr:text-start">
                                        {t('locations.fieldDimensions')}
                                    </span>
                                    <div className="max-h-28 w-full overflow-y-auto rounded-xl border border-khabeer-stroke bg-[#e7e7e7] px-4 py-2 dark:border-dark-border">
                                        <span
                                            className="block w-full break-all text-start text-xs leading-5 text-[#333] dark:text-dark-text-primary"
                                            dir="ltr"
                                            title={formData.boundary || '—'}
                                        >
                                            {formData.boundary || '—'}
                                        </span>
                                    </div>
                                    <p className="text-end text-xs leading-normal text-[#999] dark:text-dark-text-muted ltr:text-start">
                                        {t('locations.boundaryApiHint')}
                                    </p>
                                </label>

                                <div className="flex flex-row items-center gap-2" dir="ltr">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={formData.isActive}
                                        onClick={() => onChange({ ...formData, isActive: !formData.isActive })}
                                        className={clsx(
                                            'relative h-[26px] w-[51px] shrink-0 rounded-full px-1 transition-colors',
                                            formData.isActive ? 'bg-khabeer-brand' : 'bg-gray-300 dark:bg-dark-border'
                                        )}
                                    >
                                        <span
                                            className={clsx(
                                                'absolute top-1/2 size-[18px] -translate-y-1/2 rounded-full bg-white shadow transition-all',
                                                /* مادي: تشغيل = يمين، إيقاف = يسار — بدون انعكاس مع dir الصفحة */
                                                formData.isActive ? 'right-0.5' : 'left-0.5'
                                            )}
                                        />
                                    </button>
                                    <span
                                        dir={isRTL ? 'rtl' : 'ltr'}
                                        className="flex-1 text-end text-base text-[#333] dark:text-dark-text-primary ltr:text-start"
                                    >
                                        {t('locations.coverageEnabled')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch" dir="ltr">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium text-[#333] transition-colors hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                            >
                                <ArrowDown className="h-6 w-6 rotate-90 text-[#333] dark:text-dark-text-primary" aria-hidden />
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={onSubmit}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-khabeer-brand px-4 text-base font-medium text-white transition-colors hover:opacity-95 disabled:opacity-60"
                            >
                                {actionLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    <Check className="h-6 w-6" strokeWidth={2} aria-hidden />
                                )}
                                {submitLabel}
                            </button>
                        </div>
                    </div>

                    {/* Map: end side in LTR = right; dir=ltr keeps east/west & Leaflet correct */}
                    <div className="min-h-[380px] min-w-0 flex-1 lg:max-w-[761px]" dir="ltr">
                        <MapSelector
                            boundary={formData.boundary}
                            onBoundaryChange={(wkt) => onChange({ ...formData, boundary: wkt })}
                            language={language}
                            embedMode
                            accentColor="#0077b6"
                            footerHint={footerHint}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoverageZoneModal;
