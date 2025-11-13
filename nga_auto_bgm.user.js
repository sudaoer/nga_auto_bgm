// ==UserScript==
// @name         NGA 自动 BGM（自动播放与随滚动切换）
// @namespace    http://userscripts.example/nga_bgm
// @version      0.1.3
// @description  在 bbs.nga.cn 帖子中对作者插入的 <video> 块实现自动播放和随滚动切换（前区间不播放）。
// @author       sudoer
// @homepageURL  https://github.com/sudaoer/nga_auto_bgm
// @downloadURL  https://raw.githubusercontent.com/sudaoer/nga_auto_bgm/master/nga_auto_bgm.user.js
// @updateURL    https://raw.githubusercontent.com/sudaoer/nga_auto_bgm/master/nga_auto_bgm.user.js
// @match        https://bbs.nga.cn/*
// @match        https://ngabbs.com/*
// @match        https://nga.178.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
	'use strict';

	// 配置与默认值
	const DEFAULTS = {
		enabled: true, // 是否自动根据滚动切换播放
		muted: true,   // 自动播放时是否静音（浏览器通常要求静音才能自动播放）
		volume: 1.0,   // 默认音量
	};

	// GM_* 的简单包装，若不可用则 fallback 到 localStorage
	const storage = {
		get(key, def) {
			if (typeof GM_getValue === 'function') return GM_getValue(key, def);
			try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return localStorage.getItem(key) ?? def; }
		},
		set(key, val) {
			if (typeof GM_setValue === 'function') return GM_setValue(key, val);
			try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { localStorage.setItem(key, val); }
		}
	};

	// 状态
	let state = {
		enabled: storage.get('nga_auto_bgm_enabled', DEFAULTS.enabled),
		muted: storage.get('nga_auto_bgm_muted', DEFAULTS.muted),
		volume: storage.get('nga_auto_bgm_volume', DEFAULTS.volume),
		videos: [],
		positions: [],
		currentIndex: -1,
		played: new WeakSet(), // 记录首次播放判断
	};

	// CSS for control panel
	GM_addStyle && GM_addStyle(`
		#nga-auto-bgm-panel{position:fixed;right:12px;bottom:12px;z-index:999999;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:6px;font-size:12px;min-width:160px}
		#nga-auto-bgm-panel button{margin:2px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 6px;border-radius:4px;cursor:pointer}
		#nga-auto-bgm-panel .lbl{display:inline-block;margin-right:6px}
		#nga-auto-bgm-panel input[type=range]{width:100%}
	`);

	// 创建控制面板
	function createPanel() {
		if (document.getElementById('nga-auto-bgm-panel')) return;
		const panel = document.createElement('div');
		panel.id = 'nga-auto-bgm-panel';

		panel.innerHTML = `
			<div style="font-weight:600;margin-bottom:6px">NGA Auto BGM</div>
			<div><span class="lbl">自动切换</span><button id="nga-toggle-auto"></button></div>
			<div style="margin-top:6px"><span class="lbl">静音</span><button id="nga-toggle-mute"></button></div>
				<div style="margin-top:6px"><span class="lbl">音量</span><input id="nga-volume" type="range" min="0" max="1" step="0.05"></div>
				<div style="margin-top:6px;text-align:right"><button id="nga-prev">◀</button><button id="nga-playpause">❚❚/▶</button><button id="nga-locate">定位</button><button id="nga-next">▶</button></div>
			<div id="nga-status" style="margin-top:6px;font-size:11px;color:#ddd"></div>
		`;

		document.body.appendChild(panel);

		panel.querySelector('#nga-toggle-auto').addEventListener('click', () => { toggleEnabled(); });
		panel.querySelector('#nga-toggle-mute').addEventListener('click', () => { toggleMuted(); });
		panel.querySelector('#nga-volume').addEventListener('input', (e) => { setVolume(parseFloat(e.target.value)); });
		panel.querySelector('#nga-prev').addEventListener('click', () => { playPrev(); });
		panel.querySelector('#nga-next').addEventListener('click', () => { playNext(); });
		panel.querySelector('#nga-playpause').addEventListener('click', () => { playPauseToggle(); });
		panel.querySelector('#nga-locate').addEventListener('click', () => { locateCurrent(); });

		updatePanel();
	}

	function updatePanel() {
		const panel = document.getElementById('nga-auto-bgm-panel');
		if (!panel) return;
		panel.querySelector('#nga-toggle-auto').textContent = state.enabled ? '开启' : '关闭';
		panel.querySelector('#nga-toggle-mute').textContent = state.muted ? '已静音' : '有声';
		panel.querySelector('#nga-volume').value = state.volume;
		const status = panel.querySelector('#nga-status');
		const idx = state.currentIndex;
		status.textContent = `自动:${state.enabled ? '开' : '关'} | 静音:${state.muted ? '是' : '否'} | 当前:${idx>=0? (idx+1) + '/' + state.videos.length : '无'}`;
	}

	function saveState() {
		storage.set('nga_auto_bgm_enabled', state.enabled);
		storage.set('nga_auto_bgm_muted', state.muted);
		storage.set('nga_auto_bgm_volume', state.volume);
	}

	function toggleEnabled() { state.enabled = !state.enabled; saveState(); updatePanel(); syncActiveByScroll(); }
	function toggleMuted() {
		state.muted = !state.muted; saveState();
		state.videos.forEach(v => { try { v.muted = state.muted; } catch (e) {} });
		updatePanel();
	}
	function setVolume(v) { state.volume = Math.max(0, Math.min(1, v)); saveState(); state.videos.forEach(vd => { try { vd.volume = state.volume; } catch (e) {} }); updatePanel(); }

	// 若视频是首次播放，确保从头开始
	function ensureStartFromBeginning(v) {
		try {
			if (!state.played || state.played.has(v)) return;
			const set0 = () => { try { v.currentTime = 0; } catch(e){} };
			if (v.readyState >= 1) { // HAVE_METADATA
				set0();
			} else {
				v.addEventListener('loadedmetadata', set0, { once: true });
			}
			state.played.add(v);
		} catch(e) { /* noop */ }
	}

	function playIndex(i) {
		if (i < 0 || i >= state.videos.length) return stopAll();
		if (state.currentIndex === i) return; // already
		const prev = state.currentIndex;
		state.currentIndex = i;
		state.videos.forEach((v, idx) => {
			try {
				if (idx === i) {
					v.muted = state.muted;
					v.volume = state.volume;
					ensureStartFromBeginning(v);
					const p = v.play();
					if (p && p.catch) p.catch(() => {
						// 如果播放被阻止，尝试静音后再播放
						try { v.muted = true; v.play().catch(()=>{}); } catch (e) {}
					});
				} else {
					v.pause();
				}
			} catch (e) { console.warn('nga-auto-bgm play error', e); }
		});
		updatePanel();
	}

	function playPrev() { if (state.videos.length === 0) return; const i = state.currentIndex > 0 ? state.currentIndex - 1 : state.videos.length - 1; playIndex(i); }
	function playNext() { if (state.videos.length === 0) return; const i = (state.currentIndex + 1) % state.videos.length; playIndex(i); }
	function playPauseToggle() { const v = state.videos[state.currentIndex]; if (!v) return; if (v.paused) v.play().catch(()=>{}); else v.pause(); }

	function stopAll() {
		state.currentIndex = -1;
		state.videos.forEach(v => { try { v.pause(); } catch(e){} });
		updatePanel();
	}

	// 辅助：定位到当前正在播放的 BGM（若无 currentIndex，则尝试根据实际播放状态判定）
	function locateCurrent() {
		try {
			const vlist = state.videos || [];
			let idx = (typeof state.currentIndex === 'number') ? state.currentIndex : -1;
			if (idx < 0) {
				idx = vlist.findIndex(v => {
					try { return !v.paused && !v.ended && v.currentTime > 0; } catch (e) { return false; }
				});
				if (idx >= 0) state.currentIndex = idx;
			}
			if (idx >= 0 && vlist[idx]) {
				const el = vlist[idx];
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				// 提示高亮
				const oldOutline = el.style.outline;
				el.style.outline = '2px solid #4caf50';
				setTimeout(() => { try { el.style.outline = oldOutline || 'none'; } catch(e){} }, 1200);
			}
		} catch (e) {
			console.warn('nga-auto-bgm locate error', e);
		}
	}

	// 收集页面中有意义的 <video> 元素（可见且有 src）
	function refreshVideos() {
		const all = Array.from(document.querySelectorAll('video'));
		// 过滤：必须可见（有尺寸）且有 src 或 子 source
		const vids = all.filter(v => {
			try {
				const rects = v.getClientRects();
				const hasSize = rects && rects.length > 0 && (v.offsetWidth > 0 || v.offsetHeight > 0 || v.clientWidth > 0 || v.clientHeight > 0);
				const hasSrc = !!(v.currentSrc || v.src || v.querySelector && v.querySelector('source'));
				return hasSize && hasSrc;
			} catch (e) { return false; }
		});

		state.videos = vids;
		// 绑定一些事件，便于手动播放时保持 panel 状态
		state.videos.forEach(v => {
			v.style.outline = v.style.outline || 'none';
			v.addEventListener('play', () => { try { state.played.add(v); } catch(e){} updatePanel(); });
		});
		computePositions();
		updatePanel();
	}

	function computePositions() {
		const positions = state.videos.map(v => ({ el: v, top: v.getBoundingClientRect().top + window.scrollY }));
		positions.sort((a,b) => a.top - b.top);
		state.positions = positions;
		// 如果当前 index 超出范围，重置
		if (state.currentIndex >= state.videos.length) state.currentIndex = -1;
	}

	// 根据滚动位置决定当前应该播放哪一个视频
	function syncActiveByScroll() {
		if (!state.enabled) return;
		if (state.positions.length === 0) { stopAll(); return; }

		const center = window.scrollY + window.innerHeight / 2;
		// 找到最后一个 top <= center
		let idx = -1;
		for (let i = 0; i < state.positions.length; i++) {
			const top = state.positions[i].top;
			const nextTop = (i + 1 < state.positions.length) ? state.positions[i+1].top : Infinity;
			// 区间定义：从 video.top 到 下一个 video.top 之间播放该 video
			if (center >= top && center < nextTop) { idx = i; break; }
		}
		if (idx === -1) {
			// 在第一个 video 之前的不播放
			stopAll();
		} else {
			playIndex(idx);
		}
	}

	// 防抖工具
	function debounce(fn, t = 120) {
		let id = null; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); };
	}

	// 监控 DOM 变化，自动刷新 video 列表
	const mo = new MutationObserver(debounce((mutList) => {
		// 只在新增或删除 video/节点时刷新
		refreshVideos();
		syncActiveByScroll();
	}, 250));

	function init() {
		createPanel();
		refreshVideos();

		// 监听滚动/调整大小
		window.addEventListener('scroll', debounce(syncActiveByScroll, 80));
		window.addEventListener('resize', debounce(() => { computePositions(); syncActiveByScroll(); }, 200));

		// 当页面隐藏时暂停
		document.addEventListener('visibilitychange', () => {
			// 不再在页面隐藏时强制暂停，避免切换窗口/标签导致播放中断
			if (!document.hidden) {
				// 回到页面时根据当前位置校准一次
				syncActiveByScroll();
			}
		});

		// MutationObserver 观察 body
		mo.observe(document.body, { childList: true, subtree: true });

		// 菜单命令（Tampermonkey 菜单）
		try {
			typeof GM_registerMenuCommand === 'function' && GM_registerMenuCommand('切换自动切换', toggleEnabled);
			typeof GM_registerMenuCommand === 'function' && GM_registerMenuCommand('切换静音', toggleMuted);
		} catch (e) {}

		// 初次 sync
		setTimeout(() => { computePositions(); syncActiveByScroll(); }, 500);
	}

	// 键盘快捷键：M 静音切换，A 自动切换
	window.addEventListener('keydown', (e) => {
		if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
		if (e.key === 'm' || e.key === 'M') { toggleMuted(); }
		if (e.key === 'a' || e.key === 'A') { toggleEnabled(); }
		if (e.key === 'ArrowLeft') playPrev();
		if (e.key === 'ArrowRight') playNext();
		if (e.key === 'l' || e.key === 'L') locateCurrent();
	});

	// 启动
	init();
})();

