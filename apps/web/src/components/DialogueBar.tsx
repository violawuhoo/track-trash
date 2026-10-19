import { useEffect, useRef, useState } from 'react';

interface Props {
  lines: string[];
  index: number;
  onAdvance: () => void;
}

export function DialogueBar({ lines, index, onAdvance }: Props) {
  const current = lines[index] ?? '';
  const [shown, setShown] = useState('');
  const doneRef = useRef(true);

  useEffect(() => {
    if (!current) {
      setShown('');
      doneRef.current = true;
      return;
    }
    doneRef.current = false;
    setShown('');
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(current.slice(0, i));
      if (i >= current.length) {
        window.clearInterval(timer);
        doneRef.current = true;
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, [current, index]);

  const handleClick = () => {
    if (!current) return;
    if (!doneRef.current) {
      setShown(current);
      doneRef.current = true;
      return;
    }
    onAdvance();
  };

  return (
    <div className="dialogue" onClick={handleClick} role="button" tabIndex={0}>
      <div className="dialogue__avatar">AI</div>
      <div className="dialogue__text">
        {current ? shown : '搜一次区域，看看这里还剩下什么。'}
      </div>
      <div className="dialogue__next">
        {current ? (index < lines.length - 1 ? '点击继续' : '点击收起') : ''}
      </div>
    </div>
  );
}
