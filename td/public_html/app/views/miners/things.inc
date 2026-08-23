<ul>
<?
foreach($itemsMiners as $im)
{
	$im['name'] = substr($im['name'], 0, 20);
	echo '<li class="item-'.$itemList->GetRarityClass($im['rarity']).'" >';
	echo $html->link($im['name'], '/items/view/'.$im['id'], array('style' => "background-image:url(".$html->base.$im['icon'].")"));
	echo '</li>';
}
?>
</ul>


<div class="clear"></div>
<? 
$unloaded = $totalFilteredCount-count($itemsMiners);
if ($unloaded)
{
	echo '<div class="more">';
	//echo $ajax->link("Load $unloaded more things", 'js_things/'.$owner['name'].'/1', array('update' => 'ThingsDiv')); 
	echo '<a href="javascript:void(0);" onclick="$(\'LoadAll\').checked=true; $(\'SubmitButton\').click(); $(\'LoadAll\').checked=false; " >Load '.$unloaded.' more things</a>';
	echo '</div>';
}
?>

