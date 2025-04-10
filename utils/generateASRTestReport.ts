import * as XLSX from 'xlsx';

interface ASRTestItem {
  audioFile: string;
  recognitionFile: string;
  device: string;
  recognitionResult: string;
  insertionErrors: number;
  deletionErrors: number;
  substitutionErrors: number;
  totalWords: number;
  referenceText: string;
  recognizedText: string;
  resultStatus: string;
  recognitionTime: number;
  testTime: string;
}

interface ASRTestReport {
  taskName: string;
  date: string;
  audioType: string;
  audioFile: string;
  audioDuration: string;
  audioCategory: string;
  testCollection: string;
  testDuration: string;
  sentenceAccuracy: number;
  wordAccuracy: number;
  characterErrorRate: number;
  recognitionSuccessRate: number;
  totalWords: number;
  insertionErrors: number;
  deletionErrors: number;
  substitutionErrors: number;
  fastestRecognitionTime: number;
  slowestRecognitionTime: number;
  averageRecognitionTime: number;
  completedSamples: number;
  items: ASRTestItem[];
}

/**
 * Generate an Excel file based on ASR test report data
 * @param reportData The ASR test report data
 * @param fileName The name of the exported file
 */
export function generateASRTestReport(reportData: ASRTestReport, fileName: string = 'ASR测试报告.xlsx'): void {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Format the header data for the report
  const headerData = [
    ['ASR测试报告'],
    ['任务详情', '任务名称', reportData.taskName, '', '','日期信息', reportData.date, '', '','噪音级别', ''],
    ['', '噪音类型', reportData.audioType,'', '', '噪音基信息','', '', '', '验证集信息', reportData.testCollection],
    ['', '噪醒集信息', reportData.audioFile, '', '','噪音总时长', reportData.audioDuration, '', '','测试耗时', reportData.testDuration],
    ['', '句正确率', reportData.sentenceAccuracy.toFixed(4), '', '','字正确率', reportData.wordAccuracy.toFixed(4), '', '','字错误率', reportData.characterErrorRate.toFixed(3)],
    ['', '唤醒成功率', reportData.recognitionSuccessRate,'', '', '总字数', reportData.totalWords, '', '','插入错误数', reportData.insertionErrors],
    ['', '删除错误数', reportData.deletionErrors,'', '', '替换错误数', reportData.substitutionErrors, '', '','平均识别时间(ms)', reportData.averageRecognitionTime],
    ['', '最快识别时间(ms)', reportData.fastestRecognitionTime,'', '', '最慢识别时间(ms)', reportData.slowestRecognitionTime, '', '','已执行用例数', reportData.completedSamples],
    ['测试记录'],
    ['唤醒音频', '识别音频', '识别设备', '唤醒结果', '插入错误', '删除错误', '替换错误', '总字数', '标注文本', '识别文本', '识别结果', '识别时间(ms)', '测试时间']
  ];
  
  // Add test items to the data array
  const itemsData = reportData.items.map(item => [
    item.audioFile,
    item.recognitionFile,
    item.device,
    item.recognitionResult,
    item.insertionErrors,
    item.deletionErrors,
    item.substitutionErrors,
    item.totalWords,
    item.referenceText,
    item.recognizedText,
    item.resultStatus,
    item.recognitionTime,
    item.testTime
  ]);
  
  // Combine header and items data
  const allData = [...headerData, ...itemsData];
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(allData);
  
  // Set column widths
  const colWidths = [
    { wch: 15 }, // 唤醒音频
    { wch: 12 }, // 识别音频
    { wch: 10 }, // 识别设备
    { wch: 10 }, // 唤醒结果
    { wch: 8 }, // 插入错误
    { wch: 8 }, // 删除错误
    { wch: 8 }, // 替换错误
    { wch: 8 }, // 总字数
    { wch: 15 }, // 标注文本
    { wch: 15 }, // 识别文本
    { wch: 10 }, // 识别结果
    { wch: 12 }, // 识别时间
    { wch: 18 }, // 测试时间
  ];
  ws['!cols'] = colWidths;
  
  // Set merge cells for the header
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }, // ASR测试报告
    { s: { r: 1, c: 0 }, e: { r: 7, c: 0 } }, // 任务详情
    { s: { r: 1, c: 2 }, e: { r: 1, c: 4 } },
    { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } },
    { s: { r: 1, c: 10 }, e: { r: 1, c: 12 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 4 } },
    { s: { r: 2, c: 6 }, e: { r: 2, c: 8 } },
    { s: { r: 2, c: 10 }, e: { r: 2, c: 12 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },
    { s: { r: 3, c: 6 }, e: { r: 3, c: 8 } },
    { s: { r: 3, c: 10 }, e: { r: 3, c: 12 } },
    { s: { r: 4, c: 2 }, e: { r: 4, c: 4 } },
    { s: { r: 4, c: 6 }, e: { r: 4, c: 8 } },
    { s: { r: 4, c: 10 }, e: { r: 4, c: 12 } },
    { s: { r: 5, c: 2 }, e: { r: 5, c: 4 } },
    { s: { r: 5, c: 6 }, e: { r: 5, c: 8 } },
    { s: { r: 5, c: 10 }, e: { r: 5, c: 12 } },
    { s: { r: 6, c: 2 }, e: { r: 6, c: 4 } },
    { s: { r: 6, c: 6 }, e: { r: 6, c: 8 } },
    { s: { r: 6, c: 10 }, e: { r: 6, c: 12 } },
    { s: { r: 7, c: 2 }, e: { r: 7, c: 4 } },
    { s: { r: 7, c: 6 }, e: { r: 7, c: 8 } },
    { s: { r: 7, c: 10 }, e: { r: 7, c: 12 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 12 } }, // 测试记录
  ];
  
  // Set cell styles
  // Note: This is a simplified approach. For more complex styling,
  // you might need to use a different library or more complex XLSX options
  
  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, 'ASR测试报告');
  
  // Write the workbook to a file (in browser, this will trigger a download)
  XLSX.writeFile(wb, fileName);
}

/**
 * Example usage of the function
 */
export function example() {
  // Sample test report data
  const sampleReport: ASRTestReport = {
    taskName: 'L1-1-S32-识别-东北男',
    date: '2025-02-25 09:17:22',
    audioType: '',
    audioFile: 'D:\\唤醒词\\你好纳米\\你好纳米.txt',
    audioDuration: '00:00:00',
    audioCategory: '',
    testCollection: '\\话料库\\一汽北京\\1、纯音\\1、东北普通话\\ADCV001\\语音指令、导航',
    testDuration: '02:02:38',
    sentenceAccuracy: 0.7128,
    wordAccuracy: 0.8891,
    characterErrorRate: 0.112,
    recognitionSuccessRate: 1,
    totalWords: 6564,
    insertionErrors: 7,
    deletionErrors: 587,
    substitutionErrors: 141,
    fastestRecognitionTime: -1004, // Negative value in the sample data
    slowestRecognitionTime: 1821,
    averageRecognitionTime: 1711,
    completedSamples: 999,
    items: [
      {
        audioFile: '你好纳米.wav',
        recognitionFile: 'B0001.wav',
        device: 'USB设备',
        recognitionResult: 'Success',
        insertionErrors: 1,
        deletionErrors: 0,
        substitutionErrors: 0,
        totalWords: 3,
        referenceText: '我在哪',
        recognizedText: '我在哪儿',
        resultStatus: 'Fail',
        recognitionTime: 1365,
        testTime: '25-02-25 09:17:37'
      },
      {
        audioFile: '你好纳米.wav',
        recognitionFile: 'B0003.wav',
        device: 'USB设备',
        recognitionResult: 'Success',
        insertionErrors: 0,
        deletionErrors: 0,
        substitutionErrors: 0,
        totalWords: 6,
        referenceText: '定位当前位置',
        recognizedText: '定位当前位置',
        resultStatus: 'Success',
        recognitionTime: 1376,
        testTime: '25-02-25 09:17:44'
      }
    ]
  };
  
  // Generate the Excel file
  generateASRTestReport(sampleReport);
}

// Call the example function if you want to test it
// example();

// Export the function for use in other modules
export default generateASRTestReport;