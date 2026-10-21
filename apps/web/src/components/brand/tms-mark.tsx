// Dấu "thùng container" (designs/assets/Logos/tms-mark.svg), vẽ nội tuyến bằng token để đổi theo chế độ Sáng/Tối.
type TmsMarkProps = { size?: number; className?: string };

export function TmsMark({ size = 32, className }: TmsMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--primary)" />
      <rect
        x="7"
        y="10"
        width="18"
        height="12"
        rx="1.5"
        stroke="var(--on-primary)"
        strokeWidth="2"
      />
      <path
        d="M11.5 13v6M16 13v6M20.5 13v6"
        stroke="var(--on-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
