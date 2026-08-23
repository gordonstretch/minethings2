<div id="fullcenter">

<H3>Gadgets</H3>
<p>Go to the <? echo $html->link('Gadgets Market', '/mine_types/browse/'.$gadgetMineId); ?> to buy more Gadgets.  Gadgets must be in your home city to use.</p>

<?
if (isset($message))
	echo $message."<BR>";

if (!count($gadgets) and $foreignGadgetCount == 0)
	echo '<p>You have no gadgets.</p>';
else if ($foreignGadgetCount == 1)
	echo "<p>You have one gadget in a foreign city.  Bring it home to use it.</p>";
else if ($foreignGadgetCount > 1)
	echo "<p>You have $foreignGadgetCount gadgets in foreign cities.  Bring them home to use them.</p>";

foreach($gadgets as $g)
{
	echo '-----------------------------------------------------------------------------------------------------------------------------------------------------<BR>';
	echo "<b><font size=5>".$g['display_name']."</font></b>";

	echo '<div id="timeRemaining'.$g['id'].'" style="display:inline;">';
	echo $gadget->GadgetsMinerInfo($g, $g);
	echo '</div>';

	echo "<BR>";
	echo $g['description'];
	if ($isAdministrator)
		echo $html->link('edit', '/gadgets/edit/'.$g['id']);
	echo "<BR>";

	echo "<table cellspacing=0 cellpadding=0>";
	$cells = array();
	foreach($g['instances'] as $instance)
	{

		$cells[] = array($html->link($instance['name'], '/items/view/'.$instance['item_id']), array('width' => 200));
		$cells[] = '(<div id="itemCount'.$instance['item_id'].'" style="display:inline">'.$instance['count'].'</div>)';

		$buttonText = 'Add '.$instance['lifespan'].' days';
		if ($instance['count'] > 0)
		{
			$formText = $ajax->form('js_use_gadget', 'post', array(
				'update' => array('timeRemaining'.$g['id'], 'itemCount'.$instance['item_id']),
				'indicator' => 'LoadingDiv',
				'before' => "$('UseButton".$instance['item_id']."').disabled = true",
				'loaded' => "$('UseButton".$instance['item_id']."').disabled = false",
				));
			//$formText = $form->create(null, array('action' => 'js_use_gadget'));
			$formText.= $form->input('Item.id', array('type' => 'hidden', 'value' => $instance['item_id']));
			$formText.= $form->end(array('label' => $buttonText, 'id' => 'UseButton'.$instance['item_id']));
		}
		else
			$formText = '<input type="button" value="'.$buttonText.'" disabled></input>';
		$cells[] = $formText;
	}
	if (count($cells))
		echo $html->tableCells(array($cells));
	echo "</table>";
	echo "<BR><BR>";

}

if ($isAdministrator)
	echo $html->link('add', '/gadgets/add');

?>

</div>
