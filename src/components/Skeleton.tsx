import s from './Skeleton.module.css';

/** Ölçülü skeleton (CLS ≤ 0,05 üçün ölçü həmişə verilir). */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return <span className={s.sk} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
