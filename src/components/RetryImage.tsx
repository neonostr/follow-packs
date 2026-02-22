import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 3000];

interface RetryImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
}

export function RetryImage({ src, alt, className, fallback }: RetryImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const retryCount = useRef(0);
  const [imgSrc, setImgSrc] = useState(src);

  // Reset state when imgSrc changes (retry or new src prop)
  useEffect(() => {
    setLoaded(false);
  }, [imgSrc]);

  // Reset everything when src prop changes
  useEffect(() => {
    retryCount.current = 0;
    setFailed(false);
    setLoaded(false);
    setImgSrc(src);
  }, [src]);

  const handleError = () => {
    if (retryCount.current < MAX_RETRIES) {
      const currentRetry = retryCount.current;
      retryCount.current += 1;
      setTimeout(() => {
        setImgSrc(`${src}${src.includes('?') ? '&' : '?'}retry=${retryCount.current}`);
      }, RETRY_DELAYS[currentRetry]);
    } else {
      setFailed(true);
    }
  };

  if (failed) return <>{fallback}</>;

  return (
    <>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        src={imgSrc}
        alt={alt}
        className={`${className ?? ''} ${loaded ? '' : 'opacity-0 absolute'}`}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </>
  );
}
