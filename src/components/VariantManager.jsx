import React, { useState, useEffect } from "react";
import { Icon } from "./shared";
import { toast } from "./Toast";
import { getVariants, createVariant, updateVariant, deleteVariant } from "../api";

const emptyForm = { variant_name: "", sku: "", price: "", stock_quantity: "", option_values: {} };

const VariantManager = ({ entryId, canEdit = true, compact = false }) => {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [optionKey, setOptionKey] = useState("");
  const [optionVal, setOptionVal] = useState("");

  const load = async () => {
    if (!entryId) { setVariants([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getVariants(entryId);
      setVariants(data.variants || []);
    } catch {
      toast.warning("Could not load variants");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entryId]);

  const addOption = () => {
    if (!optionKey.trim()) return;
    setForm(f => ({ ...f, option_values: { ...f.option_values, [optionKey.trim()]: optionVal.trim() } }));
    setOptionKey(""); setOptionVal("");
  };

  const removeOption = (k) => {
    setForm(f => { const o = { ...f.option_values }; delete o[k]; return { ...f, option_values: o }; });
  };

  const save = async () => {
    if (!form.variant_name.trim()) return toast.warning("Variant name required");
    try {
      if (editingId) {
        await updateVariant(editingId, form);
        toast.success("Variant updated");
      } else {
        await createVariant(entryId, form);
        toast.success("Variant added");
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err?.message || "Save failed");
    }
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({
      variant_name: v.variant_name || "",
      sku: v.sku || "",
      price: v.price ?? "",
      stock_quantity: v.stock_quantity ?? "",
      option_values: v.option_values || {},
    });
  };

  const cancelEdit = () => { setForm(emptyForm); setEditingId(null); };

  const remove = async (id) => {
    if (!confirm("Delete this variant?")) return;
    try {
      await deleteVariant(id);
      toast.success("Variant deleted");
      load();
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    }
  };

  if (loading) return <div style={{ fontSize: 12, color: "var(--text-dim)", padding: 12 }}>Loading variants...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {variants.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {variants.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--hover-bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v.variant_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                  {v.sku && <span className="mono">SKU: {v.sku}</span>}
                  {v.price != null && <span>${parseFloat(v.price).toFixed(2)}</span>}
                  <span>Stock: {v.stock_quantity ?? 0}</span>
                  {v.option_values && Object.entries(v.option_values).map(([k, val]) => (
                    <span key={k} style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(124,58,237,0.12)", color: "var(--primary-light, #A78BFA)", fontWeight: 600 }}>{k}: {val}</span>
                  ))}
                </div>
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => startEdit(v)}><Icon name="edit" size={12} /></button>
                  <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "#EF4444" }} onClick={() => remove(v.id)}><Icon name="trash" size={12} color="#EF4444" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.06em" }}>
            {editingId ? "EDIT VARIANT" : "ADD VARIANT"}
          </div>
          <input className="input" style={{ fontSize: 13 }} placeholder="Variant name (e.g. Red / Large)" value={form.variant_name} onChange={e => setForm(f => ({ ...f, variant_name: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input className="input" style={{ fontSize: 12 }} placeholder="SKU" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            <input className="input" type="number" min="0" step="0.01" style={{ fontSize: 12 }} placeholder="Price" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            <input className="input" type="number" min="0" style={{ fontSize: 12 }} placeholder="Stock" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em" }}>OPTIONS (e.g. Color: Red)</div>
            {Object.entries(form.option_values).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(form.option_values).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: "rgba(124,58,237,0.15)", color: "var(--primary-light, #A78BFA)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {k}: {v}
                    <button onClick={() => removeOption(k)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}><Icon name="x" size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" style={{ fontSize: 12, flex: 1 }} placeholder="Option (e.g. Color)" value={optionKey} onChange={e => setOptionKey(e.target.value)} />
              <input className="input" style={{ fontSize: 12, flex: 1 }} placeholder="Value (e.g. Red)" value={optionVal} onChange={e => setOptionVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addOption()} />
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={addOption}><Icon name="plus" size={12} /></button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {editingId && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelEdit}>Cancel</button>}
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={save}>
              <Icon name={editingId ? "check" : "plus"} size={12} /> {editingId ? "Save" : "Add Variant"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariantManager;
