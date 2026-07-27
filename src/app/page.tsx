"use client";

import { useState } from "react";
import Swal from "sweetalert2";

const showToast = (icon: "success" | "error" | "info", title: string) => {
  void Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
    customClass: {
      popup: "emy-toast",
    },
  });
};

interface Transaction {
  data: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  responsavel?: string;
  forma_pgto?: string;
  valor: number;
}

export default function Home() {
  const [sheetType, setSheetType] = useState<
    "ordinarios" | "extraordinarios" | "bioenergia"
  >("ordinarios");
  const [files, setFiles] = useState<File[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingMaster, setIsUploadingMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [masterFile, setMasterFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter((file) =>
      [".pdf", ".csv", ".ofx", ".xlsx", ".xls"].some((extension) =>
        file.name.toLowerCase().endsWith(extension),
      ),
    );
    setFiles(validFiles);
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleMasterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMasterFile(file);
    setError(null);
  };

  const handleMasterUpload = async () => {
    if (!masterFile) {
      setError("Selecione o arquivo Excel base");
      showToast("info", "Selecione o arquivo Excel base");
      return;
    }

    const masterFileName = masterFile.name.toLowerCase();
    if (!masterFileName.endsWith(".xlsx") && !masterFileName.endsWith(".xls")) {
      setError("Apenas arquivos Excel (.xlsx, .xls) são permitidos");
      showToast("error", "Escolha um arquivo Excel válido");
      return;
    }

    setIsUploadingMaster(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", masterFile);

      const response = await fetch("/api/upload-master", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setSuccess("Arquivo Excel base carregado com sucesso!");
        showToast("success", "Planilha base carregada!");
        setMasterFile(null);
      } else {
        setError(result.error || "Erro ao carregar arquivo Excel base");
        showToast(
          "error",
          result.error || "Não foi possível carregar a planilha",
        );
      }
    } catch (err) {
      setError("Erro ao carregar arquivo Excel base");
      showToast("error", "Erro ao carregar a planilha base");
    } finally {
      setIsUploadingMaster(false);
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) {
      setError("Selecione pelo menos um arquivo");
      showToast("info", "Selecione pelo menos um extrato");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("sheetType", sheetType);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao processar extratos");
      }

      const data = await response.json();
      setTransactions(data.transactions);
      setSuccess(
        `Processado com sucesso! ${data.total} transações encontradas.`,
      );
      showToast("success", `${data.total} lançamentos processados`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erro ao processar extratos";
      if (
        errorMessage.includes("Arquivo mestre") ||
        errorMessage.includes("não encontrado")
      ) {
        setError(
          "Erro: Carregue o arquivo Excel Base antes de processar extratos.",
        );
        showToast("error", "Carregue a planilha base primeiro");
      } else if (errorMessage.includes("GEMINI_API_KEY")) {
        setError("Erro: Configure a GEMINI_API_KEY no arquivo .env.local");
        showToast("error", "Configure a chave do Gemini");
      } else {
        setError(errorMessage);
        showToast("error", errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (transactions.length === 0) {
      setError("Nenhuma transação para salvar");
      showToast("info", "Não há lançamentos para salvar");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactions,
          sheetType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao salvar transações");
      }

      // Download do arquivo
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Controle_de_despesas_mensais_atualizado.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(
        "Arquivo salvo e baixado com sucesso! Após abrir o Excel, clique em Dados > Atualizar Tudo para atualizar as tabelas dinâmicas.",
      );
      showToast("success", "Excel atualizado e baixado!");
      setTransactions([]);
      setFiles([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar transações",
      );
      showToast(
        "error",
        err instanceof Error ? err.message : "Erro ao salvar o Excel",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransactionChange = (
    index: number,
    field: keyof Transaction,
    value: string | number,
  ) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    setTransactions(updated);
  };

  const handleRemoveTransaction = (index: number) => {
    const updated = transactions.filter((_, i) => i !== index);
    setTransactions(updated);
    showToast("success", "Lançamento removido");
  };

  const isCompleteField = (value: string | undefined) => value === "COMPLETAR";

  const getColumns = () => {
    const baseColumns = [
      "DATA",
      "CATEGORIA",
      "SUBCATEGORIA",
      "DESCRIÇÃO",
      "VALOR",
    ];
    if (sheetType === "ordinarios") {
      return [
        ...baseColumns.slice(0, 4),
        "RESPONSÁVEL",
        "FORMA DE PGTO",
        "VALOR",
      ];
    }
    if (sheetType === "extraordinarios") {
      return [...baseColumns.slice(0, 4), "RESPONSÁVEL", "VALOR"];
    }
    return baseColumns;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 relative">
      {/* Loading Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center shadow-2xl">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-slate-200 border-t-blue-600 mb-6"></div>
            <p className="text-xl font-semibold text-slate-900">Processando extratos com IA...</p>
            <p className="text-sm text-slate-500 mt-2">Isso pode levar alguns segundos</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">
            Sistema Emy
          </h1>
          <p className="text-lg text-slate-600 font-medium">
            Processamento Inteligente de Extratos Bancários
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Excel Base & Sheet Selection */}
          <div className="space-y-6">
            {/* Excel Base Upload */}
            <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 p-8 border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Excel Base</h2>
                  <p className="text-sm text-slate-500">Arquivo mestre de categorias</p>
                </div>
              </div>

              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    setMasterFile(file);
                    setError(null);
                  }
                }}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer"
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleMasterFileChange}
                  className="hidden"
                  id="master-file-input"
                />
                <label htmlFor="master-file-input" className="cursor-pointer">
                  <div className="flex flex-col items-center">
                    <svg className="w-12 h-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">
                      Arraste ou clique para selecionar
                    </p>
                    <p className="text-xs text-slate-400 mt-1">.xlsx ou .xls</p>
                  </div>
                </label>
              </div>

              {masterFile && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-900">{masterFile.name}</p>
                  <p className="text-xs text-slate-500">{(masterFile.size / 1024).toFixed(1)} KB</p>
                </div>
              )}

              <button
                onClick={handleMasterUpload}
                disabled={isUploadingMaster || !masterFile}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
              >
                {isUploadingMaster ? "Carregando..." : "Carregar Excel Base"}
              </button>
            </div>

            {/* Sheet Selection */}
            <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 p-8 border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Aba de Destino</h2>
                  <p className="text-sm text-slate-500">Selecione onde salvar</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setSheetType("ordinarios")}
                  className={`w-full p-4 rounded-xl font-medium transition-all ${
                    sheetType === "ordinarios"
                      ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/25"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Ordinários</span>
                    {sheetType === "ordinarios" && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => setSheetType("extraordinarios")}
                  className={`w-full p-4 rounded-xl font-medium transition-all ${
                    sheetType === "extraordinarios"
                      ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/25"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Extraordinários</span>
                    {sheetType === "extraordinarios" && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => setSheetType("bioenergia")}
                  className={`w-full p-4 rounded-xl font-medium transition-all ${
                    sheetType === "bioenergia"
                      ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/25"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Bioenergia</span>
                    {sheetType === "bioenergia" && (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Bank Statement Upload */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 p-8 border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Extrato Bancário</h2>
                <p className="text-sm text-slate-500">Upload do arquivo para processamento</p>
              </div>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-green-400 hover:bg-green-50/50 transition-all cursor-pointer min-h-[300px] flex flex-col items-center justify-center"
            >
              <input
                type="file"
                multiple
                accept=".pdf,.csv,.ofx,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer w-full">
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-xl font-semibold text-slate-900 mb-2">
                    Arraste arquivos aqui
                  </p>
                  <p className="text-sm text-slate-500 mb-4">
                    ou clique para selecionar
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">PDF</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">CSV</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">OFX</span>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">XLSX</span>
                  </div>
                </div>
              </label>
            </div>

            {files.length > 0 && (
              <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                <p className="text-sm font-semibold text-slate-900 mb-3">
                  {files.length} arquivo(s) selecionado(s)
                </p>
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li key={index} className="flex items-center justify-between text-sm text-slate-700 bg-white p-3 rounded-lg">
                      <span className="font-medium">{file.name}</span>
                      <span className="text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleProcess}
              disabled={isProcessing || files.length === 0}
              className="w-full mt-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-green-700 hover:to-emerald-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/30"
            >
              {isProcessing ? "Processando..." : "Processar com IA"}
            </button>
          </div>
        </div>

        {/* Mensagens de erro/sucesso */}
        {error && (
          <div className="mt-8 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center gap-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mt-8 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-xl flex items-center gap-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </div>
        )}

        {/* Tabela de revisão */}
        {transactions.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg shadow-slate-200/50 p-8 border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Revisão das Transações ({transactions.length})
                </h2>
                <p className="text-sm text-slate-500">
                  Revise e edite antes de salvar
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {getColumns().map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {transactions.map((transaction, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={transaction.data}
                          onChange={(e) =>
                            handleTransactionChange(
                              index,
                              "data",
                              e.target.value,
                            )
                          }
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isCompleteField(transaction.data)
                              ? "border-red-300 bg-red-50 focus:ring-red-500"
                              : "border-slate-200 bg-white"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={transaction.categoria}
                          onChange={(e) =>
                            handleTransactionChange(
                              index,
                              "categoria",
                              e.target.value,
                            )
                          }
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isCompleteField(transaction.categoria)
                              ? "border-red-300 bg-red-50 focus:ring-red-500"
                              : "border-slate-200 bg-white"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={transaction.subcategoria}
                          onChange={(e) =>
                            handleTransactionChange(
                              index,
                              "subcategoria",
                              e.target.value,
                            )
                          }
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isCompleteField(transaction.subcategoria)
                              ? "border-red-300 bg-red-50 focus:ring-red-500"
                              : "border-slate-200 bg-white"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={transaction.descricao}
                          onChange={(e) =>
                            handleTransactionChange(
                              index,
                              "descricao",
                              e.target.value,
                            )
                          }
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isCompleteField(transaction.descricao)
                              ? "border-red-300 bg-red-50 focus:ring-red-500"
                              : "border-slate-200 bg-white"
                          }`}
                        />
                      </td>
                      {sheetType === "ordinarios" && (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={transaction.responsavel || ""}
                              onChange={(e) =>
                                handleTransactionChange(
                                  index,
                                  "responsavel",
                                  e.target.value,
                                )
                              }
                              className={`w-full px-2 py-1 border rounded text-gray-900 ${
                                isCompleteField(transaction.responsavel)
                                  ? "border-red-500 bg-red-50"
                                  : "border-gray-300 bg-white"
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={transaction.forma_pgto || ""}
                              onChange={(e) =>
                                handleTransactionChange(
                                  index,
                                  "forma_pgto",
                                  e.target.value,
                                )
                              }
                              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                isCompleteField(transaction.forma_pgto)
                                  ? "border-red-300 bg-red-50 focus:ring-red-500"
                                  : "border-slate-200 bg-white"
                              }`}
                            />
                          </td>
                        </>
                      )}
                      {sheetType === "extraordinarios" && (
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={transaction.responsavel || ""}
                            onChange={(e) =>
                              handleTransactionChange(
                                index,
                                "responsavel",
                                e.target.value,
                              )
                            }
                            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              isCompleteField(transaction.responsavel)
                                ? "border-red-300 bg-red-50 focus:ring-red-500"
                                : "border-slate-200 bg-white"
                            }`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={transaction.valor}
                          onChange={(e) =>
                            handleTransactionChange(
                              index,
                              "valor",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRemoveTransaction(index)}
                          className="text-red-600 hover:text-red-800 font-medium text-sm hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Botão salvar */}
        {transactions.length > 0 && (
          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/30"
            >
              {isSaving ? "Salvando..." : "Salvar e Baixar Arquivo Atualizado"}
            </button>
          </div>
        )}

        {/* Aviso sobre tabelas dinâmicas */}
        {transactions.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold">Importante:</p>
              <p className="text-sm mt-1">
                Após abrir o arquivo Excel, clique em{" "}
                <strong>Dados &gt; Atualizar Tudo</strong> para que as tabelas
                dinâmicas reflitam os novos lançamentos.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
