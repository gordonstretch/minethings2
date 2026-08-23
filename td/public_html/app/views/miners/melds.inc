<ul>
<?
foreach($melds as $meld)
{
	$meld['name'] = substr($meld['name'], 0, 20);
	echo '<li class="item-'.$itemList->GetRarityClass($meld['rarity']).'" >';
	$style = array();
	echo $html->link($meld['name'], '/melds/view/'.$meld['id'], $style);
	echo '</li>';
}
?>
</ul>

<div class="clear"></div>
<?
if ($undisplayedMeldCount)
{
	echo '<div class="more">';
	echo $ajax->link("Load $undisplayedMeldCount more melds", 'js_melds/'.$owner['name'], array('indicator' => 'LoadingDiv', 'update' => 'MeldsDiv')); 
	echo '</div>';
}
?>
