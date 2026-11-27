import { describe, it, expect } from 'vitest';
import { associarPlanoPatrimonio, matrizPatrimonio } from './patrimonio-grupos';
import type { Realizado } from './realizado';
const r = (data:string, valor:number, categoria='Peças', tipo:'pagar'|'receber'='pagar'):Realizado => ({id:data+categoria,chave:data,tipo,data,valor,categoria,conta:'123-4',contraparte:'Fornecedor',descricao:'',documento:'',vinculo:null});
const base = {grupos:[{id:'f',nome:'Fornecedores',planos:['p1','p2']}],planos:[{id:'p1',nome:'Peças'},{id:'p2',nome:'Serviços'}],categorias:{Peças:'p1',Serviços:'p2'},previsoes:[],de:'2026-11-01',datas:['2026-11-01','2026-11-02','2026-11-03'],granularidade:'diaria' as const};
describe('Agrupamentos do Patrimônio',()=> {
  it('reúne todos os planos associados manualmente em Fornecedores',()=> {
    const m=matrizPatrimonio({...base,realizados:[r('2026-11-01',100),r('2026-11-01',50,'Serviços')]});
    expect(m.linhas[0]?.valores).toEqual([-150,0,0]);
    expect(m.linhas[0]?.filhos).toHaveLength(2);
  });
  it('transfere a associação sem duplicar um plano em dois grupos',()=> {
    expect(associarPlanoPatrimonio([...base.grupos,{id:'outro',nome:'Outros',planos:[]}],'p1','outro')).toEqual([{id:'f',nome:'Fornecedores',planos:['p2']},{id:'outro',nome:'Outros',planos:['p1']}]);
  });
  it('calcula a oscilação entre último e primeiro dia do período selecionado',()=> {
    const m=matrizPatrimonio({...base,realizados:[r('2026-11-01',100),r('2026-11-03',150),r('2026-10-31',999),r('2026-11-04',999)]});
    expect(m.linhas[0]).toMatchObject({variacao:-50,percentual:-50,total:-250});
  });
  it('soma cada competência separadamente e compara o último mês com o primeiro',()=> {
    const m=matrizPatrimonio({...base,granularidade:'mensal',datas:['2026-11-30','2026-12-31'],realizados:[r('2026-11-01',100),r('2026-11-02',50),r('2026-12-01',200)]});
    expect(m.linhas[0]).toMatchObject({valores:[-150,-200],variacao:-50,total:-350});
  });
  it('mantém sem associação separado, sem omitir valores',()=> {
    const m=matrizPatrimonio({...base,realizados:[r('2026-11-01',80,'Outros')]});
    expect(m.linhas.find(l=>l.id==='_semgrupo')?.valores).toEqual([-80,0,0]);
    expect(m.total.total).toBe(-80);
  });
  it('não repete previsão em data já realizada',()=> {
    const m=matrizPatrimonio({...base,realizados:[r('2026-11-01',100)],previsoes:[{id:'a',tipo:'pagar',vencimento:'2026-11-01',valor:100,categoria:'Peças'},{id:'b',tipo:'pagar',vencimento:'2026-11-02',valor:80,categoria:'Peças'}]});
    expect(m.linhas[0]?.valores).toEqual([-100,-80,0]);
  });
  it('não inclui transferências financeiras no resultado',()=> {
    const m=matrizPatrimonio({...base,realizados:[r('2026-11-01',350000,'MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDA')]});
    expect(m.total.total).toBe(0);
  });
});