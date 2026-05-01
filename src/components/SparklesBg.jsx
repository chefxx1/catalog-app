import React, { useEffect, useState, useId } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

// SparklesBg — soft white particle drift used as the app background.
// Tuned for "atmospheric" not "showy": low density, slow drift, low opacity.
export default function SparklesBg({
  background = "transparent",
  particleColor = "#A78BFA",
  minSize = 0.4,
  maxSize = 1.0,
  speed = 0.5,
  particleDensity = 40,
  className,
  style,
}) {
  const [init, setInit] = useState(false);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInit(true));
  }, []);

  if (!init) return null;

  return (
    <div className={className} style={{ position: "absolute", inset: 0, ...style }}>
      <Particles
        id={`sparkles-${id}`}
        style={{ height: "100%", width: "100%" }}
        options={{
          background: { color: { value: background } },
          fullScreen: { enable: false },
          fpsLimit: 60,
          interactivity: {
            events: { onClick: { enable: false }, onHover: { enable: false }, resize: true },
          },
          particles: {
            color: { value: particleColor },
            move: {
              direction: "none",
              enable: true,
              outModes: { default: "out" },
              random: true,
              speed: { min: speed * 0.3, max: speed },
              straight: false,
            },
            number: {
              density: { enable: true, width: 800, height: 800 },
              value: particleDensity,
            },
            opacity: {
              value: { min: 0.05, max: 0.4 },
              animation: {
                enable: true,
                speed: 1.2,
                sync: false,
                startValue: "random",
              },
            },
            shape: { type: "circle" },
            size: { value: { min: minSize, max: maxSize } },
          },
          detectRetina: true,
        }}
      />
    </div>
  );
}
