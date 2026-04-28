import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { MapPin, Trash2, Search } from 'lucide-react';
import clsx from 'clsx';
import { boundaryStringToLeafletLatLngs, leafletRingToBoundaryString } from '../utils/coverageZoneBoundary';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapSelector = ({
    boundary,
    onBoundaryChange,
    language,
    embedMode = false,
    accentColor = '#0077b6',
    footerHint = null,
    mapClassName = '',
}) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [isCustomDrawing, setIsCustomDrawing] = useState(false);
    const startPointRef = useRef(null);
    const tempRectRef = useRef(null);
    const drawnItemsRef = useRef(null);
    const searchMarkerRef = useRef(null);
    const [hasPolygon, setHasPolygon] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Search for location using Nominatim
    const handleSearch = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }

        setSearching(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
            );
            const data = await response.json();
            setSearchResults(data);
            setShowResults(data.length > 0);
        } catch (error) {
            console.error('Search error:', error);
            setSearchResults([]);
            setShowResults(false);
        } finally {
            setSearching(false);
        }
    };

    // Debounced search effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) {
                handleSearch(searchQuery);
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        }, 500); // Wait 500ms after user stops typing

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Navigate to selected location
    const handleSelectLocation = (result) => {
        if (!mapInstanceRef.current) return;

        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        // Remove previous search marker if exists
        if (searchMarkerRef.current) {
            mapInstanceRef.current.removeLayer(searchMarkerRef.current);
        }

        // Add marker at searched location
        const marker = L.marker([lat, lon]).addTo(mapInstanceRef.current);
        marker.bindPopup(result.display_name).openPopup();
        searchMarkerRef.current = marker;

        // Fly to location or fit bounds
        if (result.boundingbox) {
            // Nominatim returns [minLat, maxLat, minLon, maxLon]
            const [minLat, maxLat, minLon, maxLon] = result.boundingbox.map(parseFloat);
            const corner1 = L.latLng(minLat, minLon);
            const corner2 = L.latLng(maxLat, maxLon);
            const bounds = L.latLngBounds(corner1, corner2);
            mapInstanceRef.current.fitBounds(bounds);
        } else {
            // Fallback if no bounding box
            mapInstanceRef.current.setView([lat, lon], 10);
        }

        // Clear search
        setShowResults(false);
        setSearchQuery('');
    };

    // Custom Drawing Logic: Click -> Move -> Click
    useEffect(() => {
        if (!mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        const handleMapClick = (e) => {
            if (!isCustomDrawing) return;

            if (!startPointRef.current) {
                // First click: Start drawing
                startPointRef.current = e.latlng;

                // Create temp rectangle
                const bounds = L.latLngBounds(e.latlng, e.latlng);
                tempRectRef.current = L.rectangle(bounds, {
                    color: accentColor,
                    weight: 3,
                    fillOpacity: 0.2
                }).addTo(map);

            } else {
                // Second click: Finish drawing
                const endPoint = e.latlng;
                const bounds = L.latLngBounds(startPointRef.current, endPoint);

                // Finalize selection
                const polygon = L.rectangle(bounds, {
                    color: accentColor,
                    weight: 3,
                    fillOpacity: 0.2
                });

                // Update state
                if (drawnItemsRef.current) {
                    drawnItemsRef.current.clearLayers();
                    drawnItemsRef.current.addLayer(polygon);
                }

                // Convert to boundary string
                const latlngs = polygon.getLatLngs()[0];
                const boundaryStr = leafletRingToBoundaryString(latlngs);
                onBoundaryChange(boundaryStr);
                setHasPolygon(true);

                // Reset drawing state
                setIsCustomDrawing(false);
                startPointRef.current = null;
                if (tempRectRef.current) {
                    map.removeLayer(tempRectRef.current);
                    tempRectRef.current = null;
                }
            }
        };

        const handleMouseMove = (e) => {
            if (!isCustomDrawing || !startPointRef.current || !tempRectRef.current) return;

            // Update temp rectangle bounds
            const bounds = L.latLngBounds(startPointRef.current, e.latlng);
            tempRectRef.current.setBounds(bounds);
        };

        map.on('click', handleMapClick);
        map.on('mousemove', handleMouseMove);

        return () => {
            map.off('click', handleMapClick);
            map.off('mousemove', handleMouseMove);
        };
    }, [isCustomDrawing, onBoundaryChange, accentColor]);

    // Handle cancel drawing (Escape key)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isCustomDrawing) {
                setIsCustomDrawing(false);
                startPointRef.current = null;
                if (tempRectRef.current && mapInstanceRef.current) {
                    mapInstanceRef.current.removeLayer(tempRectRef.current);
                    tempRectRef.current = null;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCustomDrawing]);


    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        // Initialize map
        const map = L.map(mapRef.current).setView([21.4225, 39.8262], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;

        // Initialize draw control for editing
        const drawControl = new L.Control.Draw({
            draw: false,
            edit: {
                featureGroup: drawnItems,
                remove: false // We use our custom delete button
            }
        });
        map.addControl(drawControl);

        // Handle edit events
        map.on(L.Draw.Event.EDITED, (e) => {
            const layers = e.layers;
            layers.eachLayer((layer) => {
                if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                    const latlngs = layer.getLatLngs()[0];
                    const boundaryStr = leafletRingToBoundaryString(latlngs);
                    onBoundaryChange(boundaryStr);
                }
            });
        });

        mapInstanceRef.current = map;

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load existing boundary... (No change needed)
    useEffect(() => {
        if (!mapInstanceRef.current || !drawnItemsRef.current) return;

        const coords = boundaryStringToLeafletLatLngs(boundary);
        if (coords && coords.length > 0) {
            drawnItemsRef.current.clearLayers();
            const polygon = L.polygon(coords, {
                color: accentColor,
                weight: 3,
                fillOpacity: 0.2
            });
            drawnItemsRef.current.addLayer(polygon);
            mapInstanceRef.current.fitBounds(polygon.getBounds());
            setHasPolygon(true);
        } else if (!boundary) {
            drawnItemsRef.current.clearLayers();
            setHasPolygon(false);
        }
    }, [boundary, accentColor]);

    const handleClear = () => {
        if (drawnItemsRef.current) {
            drawnItemsRef.current.clearLayers();
            onBoundaryChange('');
            setHasPolygon(false);
        }
    };

    const searchPlaceholder = language === 'ar' ? 'ابحث عن موقع ....' : 'Search for a location...';

    const searchInputClass = embedMode
        ? 'h-12 w-full rounded-xl border border-khabeer-stroke bg-white px-4 py-2 pe-12 text-sm text-[#333] placeholder:text-[#999] focus:outline-none focus:ring-2 focus:ring-khabeer-brand/25 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary'
        : 'w-full ps-10 pe-3 py-2 border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 dark:placeholder-dark-text-muted text-sm';

    const searchBlock = (
        <div className={embedMode ? 'relative w-full' : 'relative'}>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={searchInputClass}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
            />
            <Search
                className={embedMode
                    ? 'pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-khabeer-muted'
                    : 'absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-gray-400'}
            />

            {showResults && searchResults.length > 0 && (
                <div
                    className={
                        embedMode
                            ? 'absolute z-[1100] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-khabeer-stroke bg-white shadow-lg dark:border-dark-border dark:bg-dark-bg-elevated'
                            : 'absolute z-10 w-full mt-1 bg-white dark:bg-dark-bg-elevated border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-60 overflow-y-auto'
                    }
                >
                    {searchResults.map((result, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => handleSelectLocation(result)}
                            className="w-full border-b border-gray-100 px-3 py-2 text-start text-sm transition-colors last:border-b-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-bg-tertiary"
                        >
                            <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                                {result.display_name.split(',')[0]}
                            </div>
                            <div className="truncate text-xs text-gray-500 dark:text-dark-text-muted">
                                {result.display_name}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    const toolbar = (
        <div className="flex flex-col gap-1.5 rounded-xl bg-white p-1 shadow-sm dark:bg-dark-bg-secondary">
            {!hasPolygon && (
                <button
                    type="button"
                    onClick={() => setIsCustomDrawing(!isCustomDrawing)}
                    style={
                        isCustomDrawing
                            ? { backgroundColor: `${accentColor}22` }
                            : undefined
                    }
                    className="flex items-center justify-center rounded-lg p-2.5 text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                    title={language === 'ar' ? 'رسم مستطيل' : 'Draw rectangle'}
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    </svg>
                </button>
            )}
            {hasPolygon && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="flex items-center justify-center rounded-lg p-2.5 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    title={language === 'ar' ? 'مسح' : 'Clear'}
                >
                    <Trash2 className="h-5 w-5" />
                </button>
            )}
        </div>
    );

    if (embedMode) {
        /* dir=ltr + مواضع left/right صريحة: اليمين يبقى يمين واليسار يسار بغض النظر عن dir الصفحة */
        return (
            <div
                dir="ltr"
                className={clsx('relative flex min-h-[380px] w-full flex-1 flex-col overflow-hidden rounded-[15px] border border-khabeer-stroke bg-[#f2f2f2] dark:border-dark-border', mapClassName)}
            >
                <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex flex-col gap-2">
                    <div className="pointer-events-auto">{toolbar}</div>
                </div>
                <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] w-[min(384px,calc(100%-32px))] -translate-x-1/2">
                    <div className="pointer-events-auto">{searchBlock}</div>
                </div>
                <div
                    ref={mapRef}
                    className="h-full min-h-[380px] w-full flex-1"
                    style={{ zIndex: 1 }}
                />
                {footerHint ? (
                    <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] max-w-[calc(100%-32px)]">
                        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-sm font-medium text-[#666] shadow-sm dark:bg-dark-bg-secondary dark:text-dark-text-secondary">
                            {footerHint}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                    <MapPin className="h-4 w-4 me-2" />
                    {language === 'ar' ? 'حدد المنطقة على الخريطة' : 'Select Zone on Map'}
                </label>

                <div className="flex items-center gap-2">
                    {!hasPolygon && (
                        <button
                            type="button"
                            onClick={() => setIsCustomDrawing(!isCustomDrawing)}
                            style={
                                isCustomDrawing
                                    ? { backgroundColor: accentColor, color: '#fff' }
                                    : { color: accentColor, backgroundColor: `${accentColor}18` }
                            }
                            className="flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
                        >
                            <svg className="me-1.5 h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            </svg>
                            {isCustomDrawing
                                ? (language === 'ar' ? 'جاري الرسم... (الغاء)' : 'Drawing... (Cancel)')
                                : (language === 'ar' ? 'رسم مستطيل' : 'Draw Rectangle')}
                        </button>
                    )}
                    {hasPolygon && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="flex items-center text-xs text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                            <Trash2 className="me-1 h-3 w-3" />
                            {language === 'ar' ? 'مسح' : 'Clear'}
                        </button>
                    )}
                </div>
            </div>

            {searchBlock}

            <div
                ref={mapRef}
                className="h-80 w-full overflow-hidden rounded-lg border-2 border-gray-300 shadow-md dark:border-dark-border"
                style={{ zIndex: 1 }}
            />
            <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                {language === 'ar'
                    ? 'ابحث عن مدينة أو استخدم أداة الرسم (المربع) لتحديد المنطقة على الخريطة.'
                    : 'Search for a city or use the rectangle drawing tool to select a zone on the map.'}
            </p>
        </div>
    );
};

export default MapSelector;
