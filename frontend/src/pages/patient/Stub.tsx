export default function Stub({ title }: { title: string }) {
  return (
    <div className="card-clinical">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">
        This section is being implemented (full CRUD + AI + wearable mock).
      </p>
    </div>
  );
}

