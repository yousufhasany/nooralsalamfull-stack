"use client";

import { createContext } from "react";

/** Lets submit buttons inside an ActionForm show progress (useFormStatus only sees `<form action>`). */
export const ActionPendingContext = createContext(false);
