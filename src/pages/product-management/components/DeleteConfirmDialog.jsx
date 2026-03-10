import React from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

export default function DeleteConfirmDialog({ isOpen, isBulk, count, productName, isDeleting, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 overlay-enter" style={{ backgroundColor: "rgba(45,45,45,0.5)" }}>
      <div
        className="w-full max-w-sm rounded-xl border border-border p-6"
        style={{ backgroundColor: "var(--color-card)", boxShadow: "var(--shadow-xl)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(184,92,92,0.12)" }}
          >
            <Icon name="Trash2" size={26} color="var(--color-destructive)" />
          </div>
          <div>
            <h3
              id="delete-dialog-title"
              className="text-lg font-semibold text-foreground mb-1"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {isBulk ? `Eliminar ${count} producto${count !== 1 ? "s" : ""}` : "Eliminar producto"}
            </h3>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              {isBulk
                ? `¿Estás seguro de que deseas eliminar ${count} producto${count !== 1 ? "s" : ""} seleccionado${count !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`
                : `¿Estás seguro de que deseas eliminar "${productName}"? Esta acción no se puede deshacer.`}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <Button variant="outline" fullWidth onClick={onCancel} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" fullWidth onClick={onConfirm} disabled={isDeleting} iconName={isDeleting ? undefined : "Trash2"} iconPosition="left" iconSize={15}>
              {isDeleting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}