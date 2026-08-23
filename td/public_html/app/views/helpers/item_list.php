<?

class ItemListHelper extends AppHelper
{
	var $helpers = array('Html', 'Form', 'Ajax');

	// in: numeric class 1-6
	// out: css class 'red', 'green', 'yellow', etc
	function GetRarityClass($rarity)
	{
		switch($rarity)
		{
			case -1: return 'broken';
			case 0: return 'grey';
			case 1: return 'yellow'; 
			case 2: return 'green';
			case 3: return 'blue';
			case 4: return 'red';
			case 5: return 'purple';
			case 6: return 'orange';
			default: return '';
		}
	}

	function GetRarityColor($rarity)
	{
		switch($rarity)
		{
			case -1: return '#000000';
			case 1: return '#e0df07';
			case 2: return '#9dd713';
			case 3: return '#92b5b5';
			case 4: return '#ee6a6a';
			case 5: return '#a64891';
			case 6: return '#f79720';
		}
	}

	/*function GetIcon($mineTypeId, $rarity)
	{
		$folder = $this->Html->base.'/app/webroot/img/icons/';
		if ($rarity > 0)
			return $folder.'M'.$mineTypeId.'L'.$rarity.'.png';
		else 
			return $folder.'mine.gif';
	}*/

	function ItemIcon($rarity)
	{
		$class = $this->GetRarityClass($rarity);
		return $this->Html->image('icons/'.$class.'.gif');
	}

	function MeldList($melds)
	{
		foreach($melds as $meld)
		{
			echo '<li class="col2 item-'.$this->GetRarityClass($meld['rarity']).'">';
			echo $this->Html->link($meld['name'], '/melds/view/'.$meld['id'], array('onclick' => 'parent.location = this.href; parent.Lightview.hide(); return false;'));
			echo '</li>';
		}
	}


	function MeldTable($melds, $meldCount, $isOwner, $moreLink = false)
	{
		$rows = array();
		$row = array();
		$table = '';
		foreach($melds as $meld)
		{

			$meld['name'] = preg_replace('/ /', '&nbsp;', $meld['name']);
			$meldText = $this->Html->link($meld['name'], '/melds/view/'.$meld['id']);
			$row[] = array($meldText, array('class' => 'item-'.$this->GetRarityClass($meld['rarity']) ) );

			if (count($row) == 6)
			{
				if ($moreLink and count($rows) == 2)
				{
					array_pop($row);
					$row[] = $this->Ajax->link('more...', $moreLink['url'], array('update' => $moreLink['div']));
					$rows[] = $row;
					$row = array();
					break;
				}
				$rows[] = $row;
				$row = array();
			}
		}
		if (count($row))
			$rows[] = $row;
		$table.= '<table class="things-table" summary="Melds"><tbody>';
		$table.= '<tr><td class="larger">'.$meldCount.' Melds</td></tr>';
		if (count($rows))
			$table.= $this->Html->tableCells($rows);
		$table.= "</table>";
		if (!count($melds) and $isOwner) 
			$table.= "Find your first meld at the ".$this->Html->link('Mines', '/mine_types/browse/1')." page.";
		
		return $table;
	}

	// items is an array of arrays w/ ('id', 'name', 'hasBeenMined', 'rarity')
	function itemTable($items, $rarityColors, $isAdministrator)
	{
		return $this->_itemTableRarityRows($items, $rarityColors, $isAdministrator, false);
	}

	// items is an array of arrays w/ ('id', 'name', 'hasBeenMined', 'rarity', 'itemsMinerId')
	function itemTableCheckbox($items, $rarityColors, $isAdministrator, $allChecked = false)
	{
		return $this->_itemTableMush($items, $rarityColors, $isAdministrator, true, $allChecked);
	}

	function _itemRow($item, $rarityColors, $isAdministrator, $checkboxes, $allChecked)
	{
		if ($item['hasBeenMined'] or $isAdministrator)
		{
			if ($checkboxes)
				$text = $item['name'];
			else
				$text = $this->Html->link($item['name'], '/items/view/'.$item['id']);
		}
		else
			$text = "[undiscovered]";
		if ($checkboxes)
		{
			$atts = array('label' => $text, 'type' => 'checkbox');
			if ($allChecked or $item['checked'])
				$atts['CHECKED'] = true;
			if (isset($item['class']))
				$atts['class'] = $item['class'];
			$text = $this->Form->input("ItemsMiner.".$item['itemsMinerId'].".selected", $atts);
		}

		return array($text, array(
			'class' => 'item-'.$this->GetRarityClass($item['rarity']), 
			'style' => 'background-image:url('.$this->Html->base.$item['icon'].');',
			) );
	}

	function _itemTableRarityRows($items, $rarityColors, $isAdministrator, $checkboxes)
	{
		// find the max of the # of items per rarity
		$maxItems = 0;
		$itemCounts = array();
		foreach($items as $i)
		{
			if (isset($itemCounts[$i['rarity']]))
				$itemCounts[$i['rarity']]++;
			else
				$itemCounts[$i['rarity']] = 1;
		}	
		foreach($itemCounts as $count)
			if ($count > $maxItems)
				$maxItems = $count;


		$table = '<table class="things-table" summary="Things">';
		$table.= '<tbody>';

		$divisor = 1;
		$maxRowLength = 999;
		while ($maxRowLength > 6)
			$maxRowLength = ceil($maxItems/$divisor++);
		$row = array();
		$class = 'even';

		for($i = 0; $i < count($items); $i++)
		{
			$item = $items[$i];

			$row[] = $this->_itemRow($item, $rarityColors, $isAdministrator, $checkboxes, false);
			$changeRarity = ($i < count($items)-1 and $items[$i]['rarity'] != $items[$i+1]['rarity']);
			if ($changeRarity or count($row) == $maxRowLength)
			{
				$table.= $this->Html->tableCells(array($row));//, array('class' => $class), array('class' => $class));
				if ($changeRarity)
				{
					if ($class == 'odd')
						$class = 'even';
					else
						$class = 'odd';
				}
				$row = array();
			}
		}
		if (count($row))
			$table.= $this->Html->tableCells(array($row));// doesn't make sense, array('class' => $class), array('class' => $class) );
		
		
		$table.= "</tbody>";
		$table.= "</table>";

		return $table;

	}

	function _itemTableMush($items, $rarityColors, $isAdministrator, $checkboxes, $allChecked)
	{

		$rows = 150;
		$cols = 7;
		$table = '<table class="things-table" summary="Things">';
		for ($r = 0; $r < $rows && count($items); $r++)
		{
			$row = array();
			for ($c = 0; $c < $cols && count($items); $c++)
			{
				$index = $r*$cols + $c;
				$item = $items[$index];
				unset($items[$index]);

				$row[] = $this->_itemRow($item, $rarityColors, $isAdministrator, $checkboxes, $allChecked);

			}
			$table.= $this->Html->tableCells(array($row));
		}
		$table.= "</table>";

		return $table;

	}
}

?>