"use client";

import { useEffect, useRef } from "react";

type Ember = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  alpha: number;
};

function createEmber(width: number, height: number): Ember {
  return {
    x: Math.random() * width,
    y: height + Math.random() * 80,
    radius: 0.8 + Math.random() * 2.2,
    speed: 0.28 + Math.random() * 0.9,
    drift: -0.28 + Math.random() * 0.56,
    alpha: 0.28 + Math.random() * 0.58,
  };
}

export function EmberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const activeCanvas = canvas;
    const activeContext = context;

    let animationFrame = 0;
    let embers: Ember[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      activeCanvas.width = Math.floor(window.innerWidth * ratio);
      activeCanvas.height = Math.floor(window.innerHeight * ratio);
      activeCanvas.style.width = `${window.innerWidth}px`;
      activeCanvas.style.height = `${window.innerHeight}px`;
      activeContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      embers = Array.from({ length: reducedMotion ? 14 : 34 }, () =>
        createEmber(window.innerWidth, window.innerHeight),
      );
    }

    function draw() {
      activeContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const ember of embers) {
        ember.y -= ember.speed;
        ember.x += ember.drift;
        ember.alpha *= 0.997;

        if (ember.y < -20 || ember.alpha < 0.08) {
          Object.assign(ember, createEmber(window.innerWidth, window.innerHeight));
        }

        const gradient = activeContext.createRadialGradient(
          ember.x,
          ember.y,
          0,
          ember.x,
          ember.y,
          ember.radius * 4,
        );
        gradient.addColorStop(0, `rgba(255, 184, 75, ${ember.alpha})`);
        gradient.addColorStop(0.45, `rgba(255, 92, 31, ${ember.alpha * 0.28})`);
        gradient.addColorStop(1, "rgba(255, 92, 31, 0)");

        activeContext.fillStyle = gradient;
        activeContext.beginPath();
        activeContext.arc(ember.x, ember.y, ember.radius * 4, 0, Math.PI * 2);
        activeContext.fill();
      }

      animationFrame = window.requestAnimationFrame(draw);
    }

    resize();
    draw();

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-embers" aria-hidden="true" />;
}
