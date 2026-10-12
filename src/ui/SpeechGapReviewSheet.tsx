import React from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import type {SpeechGap} from '../domain/speechGapReview';
import {estimateApprovedSavings} from '../domain/speechGapReview';

interface Props {visible:boolean;cuts:SpeechGap[];selected:ReadonlySet<string>;
 onChange:(id:string)=>void;onSelectAll:()=>void;onClear:()=>void;
 onPreview:(candidate:SpeechGap)=>void;onApply:()=>void;onClose:()=>void;busy:boolean}
const time=(ms:number)=>{const seconds=ms/1000;return seconds.toFixed(1)+'s';};
export function SpeechGapReviewSheet({visible,cuts,selected,onChange,onSelectAll,onClear,
 onPreview,onApply,onClose,busy}:Props){
 const insets=useSafeAreaInsets();
 const duration=estimateApprovedSavings(cuts,selected)/1000;
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.backdrop}>
   <View style={[styles.sheet,{paddingBottom:Math.max(18,insets.bottom+10)}]}>
    <View style={styles.row}>
     <View><Text style={styles.title}>Review suggested cuts</Text>
      <Text style={styles.detail}>No cuts are applied until you approve them</Text></View>
     <Pressable onPress={onClose} accessibilityLabel="Close suggested cuts"><Ionicons name="close" color="white" size={26}/></Pressable>
    </View>
    <View style={styles.alert}>
     <Ionicons name="warning-outline" color="#FFD18A" size={19}/>
     <Text style={styles.alertText}>
      No recognized words does not mean silence. These gaps may contain laughter,
      emotion, music, or reactions. Listen first and protect anything important.
     </Text>
    </View>
    <View style={styles.row}>
     <Text style={styles.detail}>{selected.size} of {cuts.length} selected · save {duration.toFixed(1)}s</Text>
     <View style={styles.row}>
      <Pressable accessibilityLabel="Select every proposed cut" onPress={onSelectAll}>
       <Text style={styles.link}>All</Text></Pressable>
      <Pressable accessibilityLabel="Keep every proposed gap" onPress={onClear}>
       <Text style={styles.link}>None</Text></Pressable>
     </View>
    </View>
    <ScrollView style={{maxHeight:360}} contentContainerStyle={{gap:8,paddingVertical:7}}>
     {cuts.map((c,i)=><View key={c.id} style={styles.item}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected.has(c.id)}}
       style={styles.select} onPress={()=>onChange(c.id)}>
       <Ionicons name={selected.has(c.id)?'checkbox':'square-outline'} size={24}
        color={selected.has(c.id)?'#2BD6EA':'#CBD4DA'}/>
       <View style={{flex:1}}>
        <Text style={styles.itemTitle}>Gap {i+1} · save {time(c.savesMs)}</Text>
        <Text style={styles.detail}>Source {time(c.fromMs)} – {time(c.toMs)}</Text>
       </View>
      </Pressable>
      <Pressable accessibilityRole="button"
       accessibilityLabel={'Jump to preview gap '+(i+1)}
       style={styles.preview} onPress={()=>onPreview(c)}>
       <Ionicons name="play-outline" color="#2AD6E9" size={17}/><Text style={styles.link}>Listen</Text>
      </Pressable>
     </View>)}
    </ScrollView>
    <View style={styles.row}>
     <Pressable onPress={onClose} style={styles.secondary}>
      <Text style={styles.secondaryText}>Keep editing</Text></Pressable>
     <Pressable disabled={busy||!selected.size} onPress={onApply}
      style={[styles.primary,(!selected.size||busy)&&{opacity:.4}]}>
      <Text style={styles.primaryText}>Apply {selected.size} cut(s)</Text></Pressable>
    </View>
   </View>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'#000000AF'},
 sheet:{backgroundColor:'#21262B',borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:14,maxHeight:'90%'},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
 title:{color:'#F3F7FA',fontSize:19,fontWeight:'800'},
 detail:{color:'#ACBAC5',fontSize:12},
 alert:{flexDirection:'row',gap:9,padding:12,borderRadius:10,backgroundColor:'#41362D'},
 alertText:{flex:1,color:'#FFDBA2',fontSize:12,lineHeight:17},
 link:{color:'#28D5E9',fontWeight:'700',fontSize:12,marginHorizontal:6},
 item:{flexDirection:'row',gap:10,alignItems:'center',padding:10,
  backgroundColor:'#30363D',borderRadius:12},
 select:{flexDirection:'row',gap:12,alignItems:'center',flex:1},
 itemTitle:{color:'#F6F8FA',fontWeight:'700',fontSize:13},
 preview:{flexDirection:'row',alignItems:'center',padding:6,backgroundColor:'#1B2228',borderRadius:8},
 secondary:{flex:1,paddingVertical:13,borderWidth:1,borderColor:'#56616B',borderRadius:10,alignItems:'center'},
 secondaryText:{color:'white',fontWeight:'700'},
 primary:{flex:1,paddingVertical:13,backgroundColor:'#29D5E8',borderRadius:10,alignItems:'center'},
 primaryText:{color:'#072329',fontWeight:'800'}
});
