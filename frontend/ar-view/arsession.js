// arsession.js
export function initMarkerTracking(onMarkerFound, onMarkerLost) {
    function attach() {
        const marker = document.getElementById('main-marker')
        if (!marker) {
            setTimeout(attach, 300)
            return
        }
        marker.addEventListener('markerFound', () => {
            console.log('Marker found')
            if (onMarkerFound) onMarkerFound()
        })
        marker.addEventListener('markerLost', () => {
            console.log('Marker lost')
            if (onMarkerLost) onMarkerLost()
        })
        console.log('Marker tracking initialised')
    }
    setTimeout(attach, 800)
}