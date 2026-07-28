// shia2n-app-template には createClient() を直接呼ぶ実装が同梱されているが、
// shia2n-core も同じクライアントを提供しているため、そのまま残すと
// GoTrueClient が二重に立ち上がる（技術鉄則 §3.1）。
// このアプリでは core の単一クライアントに集約し、ここは再エクスポートのみとする。
export { supabase, fetchAll, fetchOne, insertOne, updateOne, deleteOne, upsertOne } from "shia2n-core";
