import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Scanner({ onCode }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let active = true;

    // Start camera
    reader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (!active) return;
      if (result) onCode(result.getText());
    });

    return () => { active = false; reader.reset(); };
  }, [onCode]);

  return (
    <div>
      <video ref={videoRef} style={{ width: "100%", borderRadius: 8 }} muted playsInline />
      <p style={{opacity:.7, fontSize:12}}>Tip: allow camera permission.</p>
    </div>
  );
}
