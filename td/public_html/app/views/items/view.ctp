<div id="fullcenter">

<div style="position:relative; min-height:200px; padding-right:310px"> <!-- allows image to be positioned absolute and not cover text -->
<br>

<? if ($needsImage): ?>
<? 
if (isset($imageFilename)) 
{
	echo $html->image("border.png", 
		array('style' => 'position:absolute; right:0px; top:18px; z-index:1;'));
	echo $html->image($imageFilename, 
		array('style' => 'position:absolute; right:4px; top:22px; z-index:2;', 'alt' => $item['Item']['name'])); 
}
else 
{
	echo $html->image("border.png", 
		array('style' => 'position:absolute; right:0px; top:18px; z-index:0;'));
	echo '<p style="position:absolute; right:55px; top:50px;">Want to earn some credits?</p>';
	echo $html->link("Submit An Image", '/images/submit/'.$item['Item']['id'], 
		array('style' => 'position:absolute; right:83px; top:110px; z-index:1')); 
}
?>
<? endif ?>

<div>
<span>
<!--Item Listing Table 1-->
<table class="things-table" style="float:left" summary="Item View">
<tbody>
<tr>
<td class="item-<? echo $itemList->GetRarityClass($item['Item']['rarity']); ?>" style="background-image:url(<?echo $html->base.$icon;?>)">
<b><? echo $item['Item']['name']; ?></b></td>
<td> <? echo "(".$html->link($mineTypeName, '/mine_types/browse/'.$mineTypeId).")"; ?> </td>
</tr>
</tbody>
</table>
<!--End Item Listing Table 1-->
&nbsp;&nbsp;
<? 
if ($loggedIn)
	echo $html->link('advertise this', '/ads/advertise/'.$item['Item']['marketable_id']); ?> <?
if ($isAdministrator) echo $html->link('edit', '/admins/edit_item/'.$item['Item']['id']); 
?>
</span>
</div>

<br>
<?
if ($isWatching)
	echo '<input type="button" value="Watching This" disabled><BR>';
else if ($hasLedger)
{ 
	echo $form->create(null, array('action' => 'view/'.$item['Item']['id'])); 
	echo $form->input('watch', array('type' => 'hidden', 'value' => 1)); 
	echo $form->end('Watch This'); 
}
?>
<BR>
<? echo $item['Item']['description']; ?> 
<br>
<BR>
<?
if (isset($itemStats) and count($itemStats))
	foreach($itemStats as $stat)
		echo "<b>".$stat['name']."</b>: ".$stat['value']."<br/>"; 
?>

<?
if (isset($numberNeeded))
{
	echo "<p>You need ".$numberNeeded." for ";
	echo (($numberNeeded == 1) ? "a meld.</p>" : "melds.</p>");
}


if ($item['Item']['use_label'])
{ 
	echo $html->link('['.$item['Item']['use_label'].']', '/'.$item['Item']['use_rrl']); 
	echo ' | ';
}

if ($trashOnFind) $linkText = "[Trash (*)]"; else $linkText = "[Trash]"; 
echo $html->link($linkText, '/items/trash/'.$item['Item']['id']); 
?>

</div><!-- End relative div -->
<? if($showMarket)
	echo $this->element('market'); ?>
</div><!--End FullCenter -->
