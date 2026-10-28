import { targetRotation } from '../core/selection.js';
import { attr, escapeHtml, foodImage } from './dom.js';

const SIZE = 440;
const CIRCLE = Math.PI * 2;
const themeKey = () => `${document.documentElement.dataset.mode}|${document.documentElement.dataset.accent}|${window.devicePixelRatio}`;

export class Wheel {
    constructor(canvas, photos) {
        this.canvas = canvas;
        this.photos = photos;
        this.ctx = canvas.getContext('2d');
        this.foods = [];
        this.rotation = 0;
        this.spinning = false;
        this.frame = 0;
        this.selected = -1;
    }
    setFoods(foods) {
        if (this.spinning) return;
        this.foods = [...foods]; this.rotation = 0; this.selected = -1; this.cache = null;
        if (this.photos) {
            const existing = new Map([...this.photos.children].map(slot => [slot.dataset.wheelFood, slot]));
            const slots = foods.map((food, index) => {
                const angle = (index + .5) * CIRCLE / foods.length - Math.PI / 2;
                const left = (50 + Math.cos(angle) * 32).toFixed(3);
                const top = (50 + Math.sin(angle) * 32).toFixed(3);
                let slot = existing.get(food.id);
                const identity = JSON.stringify(food);
                if (!slot || slot.photoIdentity !== identity) {
                    slot = document.createElement('div');
                    slot.className = 'wheel-photo-slot'; slot.dataset.wheelFood = food.id;
                    slot.innerHTML = `${foodImage(food, { eager: true, variant: 'thumb', priority: 'low' })}<span class="wheel-food-label" title="${attr(food.name)}">${escapeHtml(food.name)}</span>`;
                    slot.photoIdentity = identity;
                }
                slot.style.left = left + '%'; slot.style.top = top + '%';
                slot.classList.remove('is-selected');
                return slot;
            });
            this.photos.replaceChildren(...slots);
        }
        this.canvas.setAttribute('aria-label', `美食转盘，盘面候选：${foods.map(food => food.name).join('、')}。使用中心开饭或下方开始抽取按钮`);
        this.draw();
    }
    refreshTheme() {
        if (this.theme === themeKey()) return;
        this.cache = null; this.draw();
    }
    buildCache() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const bitmap = document.createElement('canvas');
        bitmap.width = bitmap.height = SIZE * dpr;
        const c = bitmap.getContext('2d'); c.scale(dpr, dpr);
        const css = getComputedStyle(document.documentElement);
        const color = name => css.getPropertyValue(name).trim();
        const palette = {
            surface: color('--surface'), line: color('--line'), accent: color('--accent'),
            slice: color('--wheel-slice'), alternate: color('--wheel-alternate'), selected: color('--wheel-selected'),
        };
        const center = SIZE / 2, radius = 195, arc = CIRCLE / Math.max(1, this.foods.length);
        c.fillStyle = palette.surface;
        c.beginPath(); c.arc(center, center, 214, 0, CIRCLE); c.fill();
        c.strokeStyle = palette.line; c.lineWidth = 1;
        c.beginPath(); c.arc(center, center, 213.5, 0, CIRCLE); c.stroke();
        const foods = this.foods.length ? this.foods : [{}];
        foods.forEach((_, index) => {
            const start = index * arc - Math.PI / 2;
            c.beginPath(); c.moveTo(center, center); c.arc(center, center, radius, start, start + arc); c.closePath();
            c.fillStyle = index === this.selected ? palette.selected : index % 2 ? palette.alternate : palette.slice;
            c.fill();
            c.strokeStyle = palette.surface; c.lineWidth = 2; c.stroke();
            if (index === this.selected) {
                c.beginPath(); c.arc(center, center, radius - 1, start + .014, start + arc - .014);
                c.strokeStyle = palette.accent; c.lineWidth = 2.5; c.stroke();
            }
        });
        // Fine rim marks make motion legible without a multicolored carnival border.
        c.strokeStyle = palette.line; c.lineWidth = 1;
        for (let i = 0; i < 64; i++) {
            const angle = i * CIRCLE / 64;
            const inner = i % 8 ? 204 : 201;
            c.beginPath(); c.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
            c.lineTo(center + Math.cos(angle) * 207, center + Math.sin(angle) * 207); c.stroke();
        }
        c.fillStyle = palette.surface;
        c.beginPath(); c.arc(center, center, 55, 0, CIRCLE); c.fill();
        c.strokeStyle = palette.line; c.lineWidth = 1;
        c.beginPath(); c.arc(center, center, 55, 0, CIRCLE); c.stroke();
        this.cache = bitmap; this.dpr = dpr; this.theme = themeKey();
    }
    draw(rotation = this.rotation) {
        this.rotation = rotation;
        if (!this.cache) this.buildCache();
        const { canvas, ctx: c, dpr } = this;
        if (canvas.width !== SIZE * dpr) canvas.width = canvas.height = SIZE * dpr;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
        c.drawImage(this.cache, 0, 0);
        canvas.style.transform = `rotate(${rotation}rad)`;
        // These end-state transforms also serve browsers without Web Animations.
        this.photos?.style.setProperty('--wheel-turn', `${rotation}rad`);
    }
    spin(foods, target, { onTick, reduced = false } = {}) {
        if (this.spinning) return Promise.resolve(null);
        this.setFoods(foods);
        const index = foods.findIndex(food => food.id === target.id);
        const end = targetRotation(index, foods.length, 4);
        this.spinning = true;
        return new Promise(resolve => {
            const animations = [], ticks = [];
            const finish = () => {
                ticks.forEach(clearTimeout);
                this.selected = index; this.cache = null; this.spinning = false;
                this.photos?.children[index]?.classList.add('is-selected');
                this.draw(end);
                animations.forEach(animation => animation.cancel());
                resolve(target);
            };
            if (reduced || !this.canvas.animate) { finish(); return; }
            // Rotation belongs on compositor layers: no canvas painting, layout
            // reads or inherited style-variable updates on animation frames.
            const timing = { duration: 1750, easing: 'cubic-bezier(.12,.76,.18,1)', fill: 'forwards' };
            const turn = [{ transform: 'rotate(0rad)' }, { transform: `rotate(${end}rad)` }];
            animations.push(this.canvas.animate(turn, timing));
            if (this.photos) {
                animations.push(this.photos.animate(turn, timing));
                for (const slot of this.photos.children) {
                    animations.push(slot.animate([
                        { transform: 'translate(-50%,-50%) rotate(0rad)' },
                        { transform: `translate(-50%,-50%) rotate(${-end}rad)` },
                    ], timing));
                }
            }
            if (onTick) for (const delay of [0, 80, 165, 260, 375, 520, 710, 960, 1320]) ticks.push(setTimeout(onTick, delay));
            animations[0].finished.then(finish, finish);
        });
    }
}
