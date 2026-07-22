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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Sistema Emy - Processamento de Extratos
        </h1>

        {/* Upload do Excel base */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Arquivo Excel Base (sempre o mesmo arquivo):
          </label>
          <div className="flex gap-4 items-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleMasterFileChange}
              className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              onClick={handleMasterUpload}
              disabled={isUploadingMaster || !masterFile}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isUploadingMaster ? "Carregando..." : "Carregar Excel Base"}
            </button>
          </div>
          {masterFile && (
            <p className="mt-2 text-sm text-gray-600">
              Arquivo selecionado: {masterFile.name}
            </p>
          )}
        </div>

        {/* Seletor de aba */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selecione a aba de destino:
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => setSheetType("ordinarios")}
              className={`px-4 py-2 rounded-lg font-medium ${
                sheetType === "ordinarios"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Ordinários
            </button>
            <button
              onClick={() => setSheetType("extraordinarios")}
              className={`px-4 py-2 rounded-lg font-medium ${
                sheetType === "extraordinarios"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Extraordinários
            </button>
            <button
              onClick={() => setSheetType("bioenergia")}
              className={`px-4 py-2 rounded-lg font-medium ${
                sheetType === "bioenergia"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Bioenergia
            </button>
          </div>
        </div>

        {/* Upload de arquivos */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload do extrato bancário (PDF, CSV, OFX ou XLSX):
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
          >
            <input
              type="file"
              multiple
              accept=".pdf,.csv,.ofx,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="cursor-pointer text-gray-600 hover:text-gray-800"
            >
              <p className="text-lg font-medium">
                Arraste arquivos aqui ou clique para selecionar
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Formatos aceitos: PDF, CSV, OFX, XLSX
              </p>
            </label>
          </div>
          {files.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {files.length} arquivo(s) selecionado(s):
              </p>
              <ul className="mt-2 space-y-1">
                {files.map((file, index) => (
                  <li key={index} className="text-sm text-gray-700">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Botão processar */}
        <div className="mb-6">
          <button
            onClick={handleProcess}
            disabled={isProcessing || files.length === 0}
            className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? "Processando..." : "Processar com IA"}
          </button>
        </div>

        {/* Mensagens de erro/sucesso */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* Tabela de revisão */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Revisão das Transações ({transactions.length})
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Revise e edite as transações antes de salvar. Campos marcados em
              vermelho precisam ser completados.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {getColumns().map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((transaction, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">
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
                          className={`w-full px-2 py-1 border rounded ${
                            isCompleteField(transaction.data)
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-2">
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
                          className={`w-full px-2 py-1 border rounded ${
                            isCompleteField(transaction.categoria)
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-2">
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
                          className={`w-full px-2 py-1 border rounded ${
                            isCompleteField(transaction.subcategoria)
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                      <td className="px-4 py-2">
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
                          className={`w-full px-2 py-1 border rounded ${
                            isCompleteField(transaction.descricao)
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                      {sheetType === "ordinarios" && (
                        <>
                          <td className="px-4 py-2">
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
                              className={`w-full px-2 py-1 border rounded ${
                                isCompleteField(transaction.responsavel)
                                  ? "border-red-500 bg-red-50"
                                  : "border-gray-300"
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
                              className={`w-full px-2 py-1 border rounded ${
                                isCompleteField(transaction.forma_pgto)
                                  ? "border-red-500 bg-red-50"
                                  : "border-gray-300"
                              }`}
                            />
                          </td>
                        </>
                      )}
                      {sheetType === "extraordinarios" && (
                        <td className="px-4 py-2">
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
                            className={`w-full px-2 py-1 border rounded ${
                              isCompleteField(transaction.responsavel)
                                ? "border-red-500 bg-red-50"
                                : "border-gray-300"
                            }`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2">
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
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleRemoveTransaction(index)}
                          className="text-red-600 hover:text-red-800 font-medium"
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
          <div className="mb-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Salvando..." : "Salvar e Baixar Arquivo Atualizado"}
            </button>
          </div>
        )}

        {/* Aviso sobre tabelas dinâmicas */}
        {transactions.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
            <p className="font-medium">Importante:</p>
            <p className="text-sm mt-1">
              Após abrir o arquivo Excel, clique em{" "}
              <strong>Dados &gt; Atualizar Tudo</strong> para que as tabelas
              dinâmicas reflitam os novos lançamentos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
