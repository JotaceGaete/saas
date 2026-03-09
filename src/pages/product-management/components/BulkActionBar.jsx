import React from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

export default function BulkActionBar({ selectedCount, onActivate, onDeactivate, onDelete, onClear }) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border border-border shadow-xl"
      style={{
        backgroundColor: "var(--color-card)",
        boxShadow: "var(--shadow-xl)",
        minWidth: "320px",
      }}
    >
      <div className="flex items-center gap-2 mr-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground"
          style={{ backgroundColor: "var(--color-primary)", fontFamily: "var(--font-data)" }}
        >
          {selectedCount}
        </div>
        <span className="text-sm font-medium text-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-caption)" }}>
          seleccionado{selectedCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="w-px h-6 bg-border" />
      <Button variant="secondary" size="sm" iconName="CheckCircle" iconPosition="left" iconSize={14} onClick={onActivate}>
        Activar
      </Button>
      <Button variant="outline" size="sm" iconName="MinusCircle" iconPosition="left" iconSize={14} onClick={onDeactivate}>
        Desactivar
      </Button>
      <Button variant="destructive" size="sm" iconName="Trash2" iconPosition="left" iconSize={14} onClick={onDelete}>
        Eliminar
      </Button>
      <button
        onClick={onClear}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all ml-1"
        aria-label="Cancelar selección"
      >
        <Icon name="X" size={15} color="currentColor" />
      </button>
    </div>
  );
}