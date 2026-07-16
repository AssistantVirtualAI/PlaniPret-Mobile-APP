import logoAsset from '@/assets/ava-statistics-logo.png.asset.json';

export function AvaFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/50 backdrop-blur-sm py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>App built by</span>
          <a
            href="https://avastatistic.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors"
          >
            <img src={logoAsset.url} alt="AVA Statistics" className="h-5 w-5 rounded-md object-cover" />
            AVA Statistics
          </a>
        </div>
        <span className="hidden sm:inline text-muted-foreground/60">·</span>
        <a
          href="https://avastatistic.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/80 hover:text-primary transition-colors"
        >
          avastatistic.ca
        </a>
      </div>
    </footer>
  );
}
