import { useState, type ReactNode } from 'react';
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
  const [retryCount, setRetryCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const imgSrc =
    retryCount > 0
      ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`
      : src;

  const handleError = () => {
    if (retryCount < MAX_RETRIES) {
      setRetrying(true);
      setTimeout(() => {
        setRetryCount((c) => c + 1);
        setRetrying(false);
      }, RETRY_DELAYS[retryCount]);
    } else {
      setFailed(true);
    }
  };

  if (failed) return <>{fallback}</>;

  return (
    <>
      {(!loaded || retrying) && (
        <Skeleton className={`absolute inset-0 rounded-none ${className ?? ''}`} />
      )}
      <img
        key={imgSrc}
        src={imgSrc}
        alt={alt}
        className={className}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </>
  );
}
