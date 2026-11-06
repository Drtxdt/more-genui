function createExperimentAPI(send) {
  let graphic;
  function publish(config={}) {
    const {figure,...values}=config;
    graphic=figure instanceof HTMLCanvasElement || figure instanceof SVGSVGElement ? figure : null;
    const json=JSON.stringify(values);
    if(new TextEncoder().encode(json).length>65536)throw Error('实验数据超过 64 KiB');
    send('experiment',{...JSON.parse(json),hasFigure:!!graphic});
  }
  async function png(){
    if(!graphic)throw Error('尚未登记图形');
    let canvas=graphic;
    if(graphic instanceof SVGSVGElement){
      canvas=document.createElement('canvas');
      const rect=graphic.getBoundingClientRect();
      canvas.width=Math.max(1,Math.min(4096,Math.ceil(rect.width)));
      canvas.height=Math.max(1,Math.min(4096,Math.ceil(rect.height)));
      const img=new Image();
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(graphic));
      await img.decode();canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    }
    if(canvas.width*canvas.height>16777216)throw Error('图形尺寸超过导出上限');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob||blob.size>8*1024*1024)throw Error('PNG 超过导出上限');
    return blob;
  }
  return {api:Object.freeze({publish}),png};
}
