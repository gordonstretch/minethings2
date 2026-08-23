<? echo $javascript->link('mods04');?>

<div id="fullcenter">

	<div style="float:right; border:solid; margin:10px; padding:10px; ">
		<div>
			<? echo $minersVehicle['Vehicle']['Item']['name']; ?> 
			<? if (strlen($minersVehicle['MinersVehicle']['name'])) echo '"'.$minersVehicle['MinersVehicle']['name'].'"'; ?> 
		</div>
		<div><? echo $html->link('[status]', '/vehicles/check_status/'.$minersVehicle['MinersVehicle']['id']); ?></div>
		<table>
			<?
			echo $html->tableCells(array(array("Mods", '<div id="attachments">0</div>')));
			foreach($statNames as $stat)
				echo $html->tableCells(array(array($stat, '<div id="'.$stat.'"></div>')));
			?>
		</table>
	</div>
	
	<? if (!isset($error)) $error = '';
	echo '<div id="ErrorDiv" class="error">'.$error.'</div>'; ?>
		
	<? include 'bolts.inc'; ?>	
	<BR>
	<BR>
	<div style="display:inline">
		<? echo $html->link('[reset]', '#', array('onclick' => 'Reset(); return false;')); ?>
		<? echo $html-> link('[clear]', '#', array('onclick' => 'Clear(); return false;')); ?>
	</div>
	

	<div style="width:650px">
	<?
	if (!count($mods))
		echo "<p>You have no mods in ".$minersVehicle['DepartingCity']['name'].".  Browse the ".$html->link("Mods Mine", '/mine_types/browse/'.$modsMineTypeId)." in ".$minersVehicle['DepartingCity']['name']." to buy some.</p>"; 

	echo $form->create('Mod', array('id' => 'ModForm', 'url' => '/vehicles/mods/'.$minersVehicle['MinersVehicle']['id']));
	$divList = array();
	foreach($mods as $m)
	{
		$id = "ModDiv".$m['Mod']['id'];
		$element = '<div class="mod" style="
			color:'.$itemList->GetRarityColor($m['Item']['rarity']).'
			" id = '.$id.' >';
		$divList[] = '$("'.$id.'")';
		
		$label = trim(strstr($m['Item']['name'], ' '));  // snip off first word
		$element.='<span style="color:#555">'.$label.'</span>';
		
		$element.= '<input class="attachmenttoggle" type="hidden" name="data[Mod]['.$m['Mod']['id'].']" value="'.($m['installed'] ? 1 : 0).'"  />';
		$element.= '<input class="attachmentinstalled" type="hidden" value="'.($m['installed'] ? 1 : 0).'"  />';
				
		$element.= '<span style="color:black; font-size:12px;">';
		foreach($statNames as $stat)
		{
			$field = strtolower($stat);
			if ($m['Mod'][$field] > 0)
				$color = 'green';
			else if ($m['Mod'][$field] < 0)
				$color = 'red';
			else
				continue;
			$element.= 	'<div>'
				.$stat.': <span class="'.$stat.'" style="color:'.$color.'; font-weight: bold;">'.$m['Mod'][$field].'</span>'
				.'</div>';
		}
		$element.= '<div style="display:none" class="boltsNeeded">'.$boltRequirements[$m['Item']['rarity']].'</div>';
		$element.= '</div>';
		echo $element;
	}
	echo '<div style="clear:left"/>';
	echo $form->end(array(
		'label' => 'Install',
		'id' => 'InstallButton',
		));
	?>
	</div>

</div>


<SCRIPT type="text/javascript">
// globals
var divList = [ <? echo join($divList, ', '); ?> ];
var statNames = <? echo json_encode($statNames); ?>; 
var correctableStatNames = <? echo json_encode($correctableStatNames); ?>;
var vehicleStats = <? echo json_encode($vehicleStats); ?>; 
AttachmentUpdate();

for (var i = 0; i < divList.length; i++)
	divList[i].onclick = function() { 

		var toggle = this.down('.attachmenttoggle');
		toggle.value = Number(toggle.value) ? 0 : 1;
				
		AttachmentUpdate(); 
		};
		
</SCRIPT>
