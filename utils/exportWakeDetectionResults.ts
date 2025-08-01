import * as XLSX from "xlsx";
import type { WakeDetectionResult } from "@/hooks/useWakeDetectionResults";
import type { WakeWord } from "@/types/api";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface WakeDetectionExportData {
  taskName: string;
  results: WakeDetectionResult[];
  wakeWords: WakeWord[];
}

export async function exportWakeDetectionResults(data: WakeDetectionExportData) {
  const { taskName, results, wakeWords } = data;
  
  if (!results || results.length === 0) {
    throw new Error("该任务没有唤醒检测结果数据");
  }

  const wb = XLSX.utils.book_new();

  // 计算统计数据
  const stats = calculateWakeDetectionStats(results);

  // 1. 创建任务概览工作表
  const overviewData = [
    ["任务概览"],
    ["任务名称", taskName],
    ["测试类型", "唤醒"],
    ["测试数量", stats.total],
    ["成功率", `${stats.successRate.toFixed(1)}%`],
    ["平均唤醒响应时间(ms)", stats.avgResponseTime],
    [""], // 空行
    ["详细说明"],
    ["测试类型说明", "唤醒检测测试包含语音识别和图像识别两种方式"],
    ["判断依据", "语音：通过ASR语音识别判定唤醒成功"],
    ["", "图像：通过视觉检测与模板图片相似度判定唤醒成功"],
    ["统计说明", "成功率 = 成功次数 / 总测试次数 × 100%"],
    ["", "平均响应时间仅计算成功样本的平均值"],
  ];

  const overviewWs = XLSX.utils.aoa_to_sheet(overviewData);
  XLSX.utils.book_append_sheet(wb, overviewWs, "任务概览");

  // 2. 创建详细结果工作表
  const headers = [
    "序号",
    "测试语料",
    "结果",
    "唤醒响应时间(ms)",
    "判断依据",
    "详细结果",
    "备注",
  ];

  const rows = results.map((result, index) => {
    const wakeWord = wakeWords.find(w => w.id === result.wake_word_id);
    const testSample = wakeWord?.text || `唤醒词 #${result.wake_word_id}`;
    
    // 判断依据和详细结果
    let judgmentBasis = "";
    let detailResult = "";
    let remark = "";
    
    if (result.success) {
      if (result.asr_result) {
        judgmentBasis = "语音";
        detailResult = `语音识别：${result.asr_result}`;
      } else {
        judgmentBasis = "图像";
        detailResult = "图像识别：与真值图片匹配成功";
      }
    } else {
      remark = "唤醒失败";
    }

    return [
      index + 1,
      testSample,
      result.success ? "Success" : "Fail",
      result.success ? result.duration_ms.toString() : "",
      judgmentBasis,
      detailResult,
      remark,
    ];
  });

  const detailWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  
  // 设置列宽
  const colWidths = [
    { wch: 8 },   // 序号
    { wch: 15 },  // 测试语料
    { wch: 10 },  // 结果
    { wch: 18 },  // 唤醒响应时间(ms)
    { wch: 12 },  // 判断依据
    { wch: 40 },  // 详细结果
    { wch: 15 },  // 备注
  ];
  detailWs['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, detailWs, "详细结果");

  // 3. 创建统计分析工作表（可选）
  const analysisData = [
    ["统计分析"],
    [""],
    ["成功/失败分布"],
    ["成功次数", stats.success],
    ["失败次数", stats.failed],
    ["成功率", `${stats.successRate.toFixed(1)}%`],
    [""],
    ["响应时间分析（仅成功样本）"],
    ["平均响应时间(ms)", stats.avgResponseTime],
    ["最快响应时间(ms)", stats.minResponseTime],
    ["最慢响应时间(ms)", stats.maxResponseTime],
    [""],
    ["判定方式分布"],
    ["语音识别成功", stats.asrSuccessCount],
    ["图像识别成功", stats.visualSuccessCount],
    ["其他失败", stats.failed - stats.asrFailedCount - stats.visualFailedCount],
  ];

  const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
  XLSX.utils.book_append_sheet(wb, analysisWs, "统计分析");

  // 生成文件名并弹出保存对话框
  const fileName = `${taskName}_唤醒检测结果_${new Date().toISOString().slice(0, 10)}.xlsx`;
  
  // 将 Excel 文件转换为二进制数据
  const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
  
  // 转换为 Uint8Array
  const buffer = new Uint8Array(excelData.length);
  for (let i = 0; i < excelData.length; i++) {
    buffer[i] = excelData.charCodeAt(i) & 0xFF;
  }
  
  // 弹出保存对话框
  const filePath = await save({
    defaultPath: fileName,
    filters: [
      {
        name: 'Excel 文件',
        extensions: ['xlsx']
      }
    ]
  });
  
  if (!filePath) {
    throw new Error('用户取消了保存操作');
  }
  
  // 保存文件
  await writeFile(filePath, buffer);
  
  return filePath.split('/').pop() || fileName;
}

function calculateWakeDetectionStats(results: WakeDetectionResult[]) {
  const total = results.length;
  const success = results.filter(r => r.success).length;
  const failed = total - success;
  const successRate = total > 0 ? (success / total) * 100 : 0;
  
  // 只计算成功样本的响应时间
  const successResults = results.filter(r => r.success);
  const responseTimes = successResults.map(r => r.duration_ms);
  const avgResponseTime = responseTimes.length > 0 
    ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
    : 0;
  const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  
  // 判定方式统计
  const asrSuccessCount = successResults.filter(r => r.asr_result).length;
  const visualSuccessCount = successResults.filter(r => !r.asr_result).length;
  
  return {
    total,
    success,
    failed,
    successRate,
    avgResponseTime,
    minResponseTime,
    maxResponseTime,
    asrSuccessCount,
    visualSuccessCount,
    // 以下字段可能需要根据实际数据调整
    asrFailedCount: results.filter(r => !r.success && r.asr_result === undefined).length,
    visualFailedCount: results.filter(r => !r.success && r.asr_result === undefined).length,
  };
}