import { forwardRef } from 'react';

interface Props {
  src: string;
  width: number;
  height: number;
}

export const MobileIframe = forwardRef<HTMLIFrameElement, Props>(({ src, width, height }, ref) => {
  return (
    <iframe
      ref={ref}
      src={src}
      title="AVA Softphone Mobile Preview"
      style={{
        width,
        height,
        border: 'none',
        background: '#000',
        display: 'block',
      }}
      allow="microphone; camera; clipboard-read; clipboard-write; autoplay"
    />
  );
});
MobileIframe.displayName = 'MobileIframe';
