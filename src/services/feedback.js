export function createFeedback(getSettings) {
    let audio;
    function tone(frequency, duration, volume) {
        if (!getSettings().sound) return;
        try {
            audio ||= new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume().catch(() => {});
            const oscillator = audio.createOscillator(), gain = audio.createGain();
            oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(volume, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
            oscillator.connect(gain); gain.connect(audio.destination);
            oscillator.start(); oscillator.stop(audio.currentTime + duration);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        } catch { /* Lack of audio never blocks a draw. */ }
    }
    return { tick: () => tone(520, 0.035, 0.035), finish: () => { tone(660, 0.2, 0.08); setTimeout(() => tone(880, 0.35, 0.07), 120); } };
}

export async function enableShake(onShake) {
    if (!window.isSecureContext || !window.DeviceMotionEvent) throw new Error('当前浏览器不支持摇一摇，可使用转盘按钮');
    if (typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') throw new Error('未获得运动权限，可在设置中重新允许');
    let previous = null, lastTrigger = -Infinity;
    const listener = event => {
        const current = event.accelerationIncludingGravity;
        if (!current || [current.x, current.y, current.z].some(v => !Number.isFinite(v))) return;
        const now = performance.now();
        if (previous) {
            const distance = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
            if (distance > 26 && now - lastTrigger > 4000 && !document.hidden) { lastTrigger = now; onShake(); }
        }
        previous = { x: current.x, y: current.y, z: current.z };
    };
    window.addEventListener('devicemotion', listener, { passive: true });
    return () => window.removeEventListener('devicemotion', listener);
}
