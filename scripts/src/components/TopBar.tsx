import Link from "next/link";

export default function TopBar({ ownerName }: { ownerName?: string }) {
  return (
    <div className="topbar">
      <Link className="brand" href="/trips">
        Way<span>fare</span>
      </Link>
      <div className="row-tight">
        {ownerName && <span className="small muted">{ownerName}</span>}
        <a className="btn btn-ghost btn-sm" href="/api/auth/logout">
          Sign out
        </a>
      </div>
    </div>
  );
}
