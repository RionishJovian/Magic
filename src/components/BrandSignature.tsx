export function BrandSignature({ className = "" }: { className?: string }) {
  return (
    <span className={`signature text-[10px] text-muted-foreground ${className}`}>
      Vibes by <span className="signature-name">Nish</span>
    </span>
  );
}

export default BrandSignature;
