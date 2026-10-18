import { useEffect, useState } from 'preact/hooks';
import { controller } from '../core/controller';

/** コントローラの状態が変わるたびに再描画する */
export function useController() {
  const [, setVersion] = useState(controller.version);
  useEffect(() => {
    const unsub = controller.subscribe(() => setVersion(controller.version));
    return () => {
      unsub();
    };
  }, []);
  return controller;
}
