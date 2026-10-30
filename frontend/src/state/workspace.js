import { createContext, useContext, useMemo, useReducer } from "react";

const Ctx = createContext(null);

const reducer = (state, action) => (action.type === "PANEL" ? { ...state, panel: action.panel } : state);

export function WorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { panel: null });
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
